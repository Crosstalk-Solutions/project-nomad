#!/usr/bin/env python3
"""Project N.O.M.A.D. native macOS inference worker.

This worker intentionally exposes a small OpenAI-compatible surface so the
Command Center can use native MLX/Core ML models without running those runtimes
inside Docker.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


DEFAULT_MODEL_ROOT = Path.home() / ".project-nomad" / "mac-ai" / "models"


def json_response(handler: BaseHTTPRequestHandler, status: int, payload: dict[str, Any]) -> None:
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class ModelRegistry:
    def __init__(self, model_root: Path):
        self.model_root = model_root.expanduser()
        self.registry_path = self.model_root / "models.json"
        self.model_root.mkdir(parents=True, exist_ok=True)

    def list_models(self) -> list[dict[str, Any]]:
        configured = self._configured_models()
        discovered = self._discovered_models()
        by_id: dict[str, dict[str, Any]] = {}
        for model in [*discovered, *configured]:
            by_id[model["id"]] = model
        return sorted(by_id.values(), key=lambda item: item["id"])

    def find(self, model_id: str) -> dict[str, Any] | None:
        for model in self.list_models():
            if model["id"] == model_id:
                return model
        return None

    def _configured_models(self) -> list[dict[str, Any]]:
        if not self.registry_path.exists():
            return []
        data = json.loads(self.registry_path.read_text("utf-8"))
        models = data.get("models", data if isinstance(data, list) else [])
        out: list[dict[str, Any]] = []
        for raw in models:
            if not isinstance(raw, dict) or not raw.get("id"):
                continue
            backend = raw.get("backend", "mlx")
            out.append(
                {
                    "id": str(raw["id"]),
                    "object": "model",
                    "name": str(raw.get("name") or raw["id"]),
                    "backend": "coreml" if backend == "coreml" else "mlx",
                    "path": str(raw.get("path") or raw["id"]),
                    "usable_for_chat": bool(raw.get("usable_for_chat", backend != "coreml")),
                    "notes": raw.get("notes"),
                }
            )
        return out

    def _discovered_models(self) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        if not self.model_root.exists():
            return out
        for child in self.model_root.iterdir():
            if child.name == "models.json":
                continue
            if child.is_dir() and (child / "config.json").exists():
                out.append(
                    {
                        "id": child.name,
                        "object": "model",
                        "name": child.name,
                        "backend": "mlx",
                        "path": str(child),
                        "usable_for_chat": True,
                    }
                )
            elif child.suffix in {".mlmodel", ".mlpackage"}:
                out.append(
                    {
                        "id": child.name,
                        "object": "model",
                        "name": child.name,
                        "backend": "coreml",
                        "path": str(child),
                        "usable_for_chat": False,
                        "notes": "Core ML model is installed, but no chat adapter is configured.",
                    }
                )
        return out


class MlxRuntime:
    def __init__(self):
        self._loaded: dict[str, Any] = {}

    def generate(self, model_ref: str, messages: list[dict[str, str]], max_tokens: int, temperature: float) -> str:
        try:
            from mlx_lm import generate, load
        except Exception as exc:  # pragma: no cover - host dependency
            raise RuntimeError("mlx-lm is not installed in the native worker venv.") from exc

        if model_ref not in self._loaded:
            self._loaded[model_ref] = load(model_ref)
        model, tokenizer = self._loaded[model_ref]

        prompt = self._prompt(tokenizer, messages)
        return generate(
            model,
            tokenizer,
            prompt=prompt,
            max_tokens=max_tokens,
            temp=temperature,
            verbose=False,
        )

    @staticmethod
    def _prompt(tokenizer: Any, messages: list[dict[str, str]]) -> str:
        if hasattr(tokenizer, "apply_chat_template"):
            try:
                return tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
            except Exception:
                pass
        return "\n".join(f"{m.get('role', 'user')}: {m.get('content', '')}" for m in messages) + "\nassistant:"


def make_handler(registry: ModelRegistry, mlx_runtime: MlxRuntime):
    class Handler(BaseHTTPRequestHandler):
        server_version = "NomadMacAI/1.0"

        def do_GET(self) -> None:  # noqa: N802
            if self.path == "/health":
                json_response(self, 200, {"status": "ok", "model_root": str(registry.model_root)})
                return
            if self.path == "/v1/models":
                json_response(self, 200, {"object": "list", "data": registry.list_models()})
                return
            json_response(self, 404, {"error": {"message": "Not found"}})

        def do_POST(self) -> None:  # noqa: N802
            if self.path != "/v1/chat/completions":
                json_response(self, 404, {"error": {"message": "Not found"}})
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                payload = json.loads(self.rfile.read(length).decode("utf-8"))
                model_id = payload.get("model")
                model_info = registry.find(model_id)
                if not model_info:
                    json_response(self, 404, {"error": {"message": f"Model not found: {model_id}"}})
                    return
                if model_info["backend"] == "coreml" or not model_info.get("usable_for_chat", False):
                    json_response(
                        self,
                        400,
                        {"error": {"message": "This Core ML model is installed but is not configured as a chat model."}},
                    )
                    return
                text = mlx_runtime.generate(
                    model_info.get("path") or model_id,
                    payload.get("messages", []),
                    int(payload.get("max_tokens") or payload.get("max_completion_tokens") or 512),
                    float(payload.get("temperature", 0.7)),
                )
                if payload.get("stream"):
                    self.send_response(200)
                    self.send_header("Content-Type", "text/event-stream")
                    self.send_header("Cache-Control", "no-cache")
                    self.end_headers()
                    chunk = {
                        "id": "nomad-mac-ai",
                        "object": "chat.completion.chunk",
                        "model": model_id,
                        "choices": [{"index": 0, "delta": {"content": text}, "finish_reason": None}],
                    }
                    self.wfile.write(f"data: {json.dumps(chunk)}\n\n".encode("utf-8"))
                    done = {
                        "id": "nomad-mac-ai",
                        "object": "chat.completion.chunk",
                        "model": model_id,
                        "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
                    }
                    self.wfile.write(f"data: {json.dumps(done)}\n\ndata: [DONE]\n\n".encode("utf-8"))
                    return
                json_response(
                    self,
                    200,
                    {
                        "id": "nomad-mac-ai",
                        "object": "chat.completion",
                        "model": model_id,
                        "choices": [{"index": 0, "message": {"role": "assistant", "content": text}, "finish_reason": "stop"}],
                    },
                )
            except Exception as exc:
                traceback.print_exc(file=sys.stderr)
                json_response(self, 500, {"error": {"message": str(exc)}})

        def log_message(self, fmt: str, *args: Any) -> None:
            sys.stderr.write(f"[nomad-mac-ai] {self.address_string()} {fmt % args}\n")

    return Handler


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default=os.environ.get("NOMAD_MAC_AI_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("NOMAD_MAC_AI_PORT", "8765")))
    parser.add_argument("--model-root", default=os.environ.get("NOMAD_MAC_AI_MODEL_ROOT", str(DEFAULT_MODEL_ROOT)))
    args = parser.parse_args()

    registry = ModelRegistry(Path(args.model_root))
    server = ThreadingHTTPServer((args.host, args.port), make_handler(registry, MlxRuntime()))
    print(f"nomad-mac-ai listening on http://{args.host}:{args.port}", flush=True)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
