<div align="center">
<img src="https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/main/admin/public/project_nomad_logo.png" width="200" height="200"/>

# Project N.O.M.A.D.
### Node for Offline Media, Archives, and Data

**Knowledge That Never Goes Offline**

[![Website](https://img.shields.io/badge/Website-projectnomad.us-blue)](https://www.projectnomad.us)
[![Discord](https://img.shields.io/badge/Discord-Join%20Community-5865F2)](https://discord.com/invite/crosstalksolutions)
[![Benchmark](https://img.shields.io/badge/Benchmark-Leaderboard-green)](https://benchmark.projectnomad.us) | [![Website](https://img.shields.io/badge/Website-projectnomad.us-blue)](https://www.projectnomad.us)
[![Discord](https://img.shields.io/badge/Discord-Join%20Community-5865F2)](https://discord.com/invite/crosstalksolutions)
[![Benchmark](https://img.shields.io/badge/Benchmark-Leaderboard-green)](https://benchmark.projectnomad.us)

</div>

---

Project N.O.M.A.D. is a self-contained, offline-first knowledge and education server packed with critical tools, knowledge, and AI to keep you informed and empowered—anytime, anywhere. | 計畫 N.O.M.A.D. 是一個自給自足的優先離線知識與教育伺服器，集成了關鍵工具、知識庫和 AI，讓您隨時隨地保持資訊獲取與自主能力。

## Installation & Quickstart
Project N.O.M.A.D. can be installed on any Debian-based operating system (we recommend Ubuntu). Installation is completely terminal-based, and all tools and resources are designed to be accessed through the browser, so there's no need for a desktop environment if you'd rather setup N.O.M.A.D. as a "server" and access it through other clients. | ## 安裝與快速開始
計畫 N.O.M.A.D. 可安裝在任何 Debian 系作業系統上（建議使用 Ubuntu）。安裝過程完全透過終端機，所有工具與資源皆設計透過瀏覽器存取，因此若您希望將 N.O.M.A.D. 設定為「伺服器」並透過其他裝置存取，無需桌面環境。

*Note: sudo/root privileges are required to run the install script* | *注意：執行安裝腳本需要 sudo/root 權限*

#### Quick Install (Debian-based OS Only)
```bash
sudo apt-get update && sudo apt-get install -y curl && curl -fsSL https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/main/install/install_nomad.sh -o install_nomad.sh && sudo bash install_nomad.sh
```

Project N.O.M.A.D. is now installed on your device! Open a browser and navigate to `http://localhost:8080` (or `http://DEVICE_IP:8080`) to start exploring! | #### 快速安裝（僅限 Debian 系作業系統）
```bash
sudo apt-get update && sudo apt-get install -y curl && curl -fsSL https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/main/install/install_nomad.sh -o install_nomad.sh && sudo bash install_nomad.sh
```

計畫 N.O.M.A.D. 已安裝完成！開啟瀏覽器並導覽至 `http://localhost:8080`（或 `http://DEVICE_IP:8080`）開始探索！

### Advanced Installation
For more control over the installation process, copy and paste the [Docker Compose template](https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/main/install/management_compose.yaml) into a `docker-compose.yml` file and customize it to your liking (be sure to replace any placeholders with your actual values). Then, run `docker compose up -d` to start the Command Center and its dependencies. Note: this method is recommended for advanced users only, as it requires familiarity with Docker and manual configuration before starting. | ### 高級安裝
若需更精細控制安裝流程，請將 [Docker Compose 範本](https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/main/install/management_compose.yaml) 複製到 `docker-compose.yml` 檔案中並依需求客製化（確認將佔位符替換為實際值）。接著執行 `docker compose up -d` 啟動指揮中心及其依賴服務。注意：此方法僅推薦給進階用戶，需熟悉 Docker 並在啟動前進行手動配置。

## How It Works
N.O.M.A.D. is a management UI ("Command Center") and API that orchestrates a collection of containerized tools and resources via [Docker](https://www.docker.com/). It handles installation, configuration, and updates for everything — so you don't have to. | ## 運作原理
N.O.M.A.D. 是一個管理介面（「指揮中心」）和 API，透過 [Docker](https://www.docker.com/) 協調一組容器化工具與資源。它負責所有項目的安裝、配置與更新 — 您無需親自動手。

**Built-in capabilities include:**
- **AI Chat with Knowledge Base** — local AI chat powered by [Ollama](https://ollama.com/), with document upload and semantic search (RAG via [Qdrant](https://qdrant.tech/))
- **Information Library** — offline Wikipedia, medical references, ebooks, and more via [Kiwix](https://kiwix.org/)
- **Education Platform** — Khan Academy courses with progress tracking via [Kolibri](https://learningequality.org/kolibri/)
- **Offline Maps** — downloadable regional maps via [ProtoMaps](https://protomaps.com)
- **Data Tools** — encryption, encoding, and analysis via [CyberChef](https://gchq.github.io/CyberChef/)
- **Notes** — local note-taking via [FlatNotes](https://github.com/dullage/flatnotes)
- **System Benchmark** — hardware scoring with a [community leaderboard](https://benchmark.projectnomad.us)
- **Easy Setup Wizard** — guided first-time configuration with curated content collections | **內建功能包括：**
- **知識庫 AI 聊天** — 由 [Ollama](https://ollama.com/) 驅動的本地 AI 聊天，支援文件上傳與語意搜尋（透過 [Qdrant](https://qdrant.tech/) 實現 RAG）
- **資訊庫** — 透過 [Kiwix](https://kiwix.org/) 提供離線維基百科、醫學參考、電子書等
- **教育平台** — 透過 [Kolibri](https://learningequality.org/kolibri/) 提供 Khan Academy 課程與進度追蹤
- **離線地圖** — 透過 [ProtoMaps](https://protomaps.com) 提供可下載的地區地圖
- **資料工具** — 透過 [CyberChef](https://gchq.github.io/CyberChef/) 提供加密、編碼與分析工具
- **筆記** — 透過 [FlatNotes](https://github.com/dullage/flatnotes) 提供本地筆記功能
- **系統效能測試** — 硬體評分與[社群排行榜](https://benchmark.projectnomad.us)
- **簡易設定精靈** — 引導式首次配置，附策展內容收藏

N.O.M.A.D. also includes built-in tools like a Wikipedia content selector, ZIM library manager, and content explorer. | N.O.M.A.D. 還包含內建工具，例如維基百科內容選擇器、ZIM 庫管理器和內容瀏覽器。

## What's Included

| Capability | Powered By | What You Get |
|-----------|-----------|-------------|
| Information Library | Kiwix | Offline Wikipedia, medical references, survival guides, ebooks |
| AI Assistant | Ollama + Qdrant | Built-in chat with document upload and semantic search |
| Education Platform | Kolibri | Khan Academy courses, progress tracking, multi-user support |
| Offline Maps | ProtoMaps | Downloadable regional maps with search and navigation |
| Data Tools | CyberChef | Encryption, encoding, hashing, and data analysis |
| Notes | FlatNotes | Local note-taking with markdown support |
| System Benchmark | Built-in | Hardware scoring, Builder Tags, and community leaderboard | | ## 包含內容

| 功能 | 技術基礎 | 您將獲得 |
|-----------|-----------|-------------|
| 資訊庫 | Kiwix | 離線維基百科、醫學參考、生存指南、電子書 |
| AI 助手 | Ollama + Qdrant | 內建聊天系統，支援文件上傳與語意搜尋 |
| 教育平台 | Kolibri | Khan Academy 課程、進度追蹤、多人支援 |
| 離線地圖 | ProtoMaps | 可下載的地區地圖，具備搜尋與導航功能 |
| 資料工具 | CyberChef | 加密、編碼、雜湊與資料分析 |
| 筆記 | FlatNotes | 本地筆記功能，支援 Markdown |
| 系統效能測試 | 內建 | 硬體評分、Builder Tags 與社群排行榜 |

## Device Requirements
While many similar offline survival computers are designed to be run on bare-minimum, lightweight hardware, Project N.O.M.A.D. is quite the opposite. To install and run the
available AI tools, we highly encourage the use of a beefy, GPU-backed device to make the most of your install. | ## 裝置需求
許多類似的離線生存電腦設計為在最低配置的輕量級硬體上運行，但計畫 N.O.M.A.D. 則截然不同。為了安裝並執行可用的 AI 工具，我們強烈建議使用配備強大 GPU 的裝置，以充分發揮安裝效果。

At it's core, however, N.O.M.A.D. is still very lightweight. For a barebones installation of the management application itself, the following minimal specs are required: | 然而，N.O.M.A.D. 的核心仍然非常輕量。對於管理應用程式本身的精簡安裝，需滿足以下最低規格：

*Note: Project N.O.M.A.D. is not sponsored by any hardware manufacturer and is designed to be as hardware-agnostic as possible. The harware listed below is for example/comparison use only* | *注意：計畫 N.O.M.A.D. 未接受任何硬體製造商贊助，並設計為盡可能與硬體無關。以下列出的硬體僅供範例/比較使用*

#### Minimum Specs
- Processor: 2 GHz dual-core processor or better
- RAM: 4GB system memory
- Storage: At least 5 GB free disk space
- OS: Debian-based (Ubuntu recommended)
- Stable internet connection (required during install only) | #### 最低規格
- 處理器：2 GHz 雙核心處理器或更高
- RAM：4 GB 系統記憶體
- 儲存空間：至少 5 GB 可用磁碟空間
- 作業系統：Debian 系（建議 Ubuntu）
- 穩定網際網路連線（僅安裝時需要）

To run LLM's and other included AI tools: | 若要執行 LLM 與其他內建的 AI 工具：

#### Optimal Specs
- Processor: AMD Ryzen 7 or Intel Core i7 or better
- RAM: 32 GB system memory
- Graphics: NVIDIA RTX 3060 or AMD equivalent or better (more VRAM = run larger models)
- Storage: At least 250 GB free disk space (preferably on SSD)
- OS: Debian-based (Ubuntu recommended)
- Stable internet connection (required during install only) | #### 最佳規格
- 處理器：AMD Ryzen 7 或 Intel Core i7 或更高
- RAM：32 GB 系統記憶體
- 顯示卡：NVIDIA RTX 3060 或 AMD 同級或更高（更多 VRAM = 可執行更大模型）
- 儲存空間：至少 250 GB 可用磁碟空間（建議 SSD）
- 作業系統：Debian 系（建議 Ubuntu）
- 穩定網際網路連線（僅安裝時需要）

**For detailed build recommendations at three price points ($150–$1,000+), see the [Hardware Guide](https://www.projectnomad.us/hardware).** | **如需三種價位（$150–$1,000+）的詳細建置建議，請參閱【硬體指南】(https://www.projectnomad.us/hardware)。**

Again, Project N.O.M.A.D. itself is quite lightweight - it's the tools and resources you choose to install with N.O.M.A.D. that will determine the specs required for your unique deployment | 再次強調，計畫 N.O.M.A.D. 本身非常輕量 — 真正決定您獨特部署所需規格的，是您選擇透過 N.O.M.A.D. 安裝的工具與資源。

## About Internet Usage & Privacy
Project N.O.M.A.D. is designed for offline usage. An internet connection is only required during the initial installation (to download dependencies) and if you (the user) decide to download additional tools and resources at a later time. Otherwise, N.O.M.A.D. does not require an internet connection and has ZERO built-in telemetry. | ## 網際網路使用與隱私
計畫 N.O.M.A.D. 專為離線使用設計。網際網路連線僅在初始安裝期間（用於下載依賴項）以及當您（用戶）稍後決定下載額外工具與資源時才需要。除此之外，N.O.M.A.D. 不需要網際網路連線，且內建零數據傳輸。

To test internet connectivity, N.O.M.A.D. attempts to make a request to Cloudflare's utility endpoint, `https://1.1.1.1/cdn-cgi/trace` and checks for a successful response. | 為測試網際網路連線，N.O.M.A.D. 會嘗試向 Cloudflare 的公用端點 `https://1.1.1.1/cdn-cgi/trace` 發出請求並檢查是否成功回應。

## About Security
By design, Project N.O.M.A.D. is intended to be open and available without hurdles - it includes no authentication. If you decide to connect your device to a local network after install (e.g. for allowing other devices to access it's resources), you can block/open ports to control which services are exposed. | ## 關於安全性
設計上，計畫 N.O.M.A.D. 意圖開放且無障礙地存取 — 不包含任何身份驗證。若您在安裝後決定將裝置連接到區域網路（例如，允許其他裝置存取其資源），您可以封鎖/開啟連接埠以控制哪些服務被公開。

**Will authentication be added in the future?** Maybe. It's not currently a priority, but if there's enough demand for it, we may consider building in an optional authentication layer in a future release to support uses cases where multiple users need access to the same instance but with different permission levels (e.g. family use with parental controls, classroom use with teacher/admin accounts, etc.). For now, we recommend using network-level controls to manage access if you're planning to expose your N.O.M.A.D. instance to other devices on a local network. N.O.M.A.D. is not designed to be exposed directly to the internet, and we strongly advise against doing so unless you really know what you're doing, have taken appropriate security measures, and understand the risks involved. | **未來會新增身份驗證嗎？** 也許。目前不是優先事項，但若有足夠需求，我們可能會考慮在未來版本中內建可選的身份驗證層，以支援多個用戶存取同一實例但具備不同權限層級的情境（例如，家長控制的家庭使用、具教師/管理員帳戶的教室使用等）。目前，若您打算將 N.O.M.A.D. 實例對區域網路上的其他裝置公開，我們建議使用網路層級控制來管理存取。N.O.M.A.D. 不設計為直接對網際網路公開，除非您非常清楚自己在做什麼、已採取適當的安全措施並了解相關風險，否則強烈建議不要這樣做。

## Contributing
Contributions are welcome and appreciated! Please read this section fully to understand how to contribute to the project. | ## 貢貢獻
歡迎並感謝貢獻！請完整閱讀此章節以瞭解如何為本項目做出貢獻。

### General Guidelines | ### 一般指導原則

- **Open an issue first**: Before starting work on a new feature or bug fix, please open an issue to discuss your proposed changes. This helps ensure that your contribution aligns with the project's goals and avoids duplicate work. Title the issue clearly and provide a detailed description of the problem or feature you want to work on. | - **先開啟 Issue**：在開始新功能或錯誤修復工作前，請先開啟 Issue 討論您的提議變更。這有助確保您的貢獻與項目目標一致，避免重複工作。明確標示 Issue 標題並提供您要處理的問題或功能的詳細描述。
- **Fork the repository**: Click the "Fork" button at the top right of the repository page to create a copy of the project under your GitHub account. | - **Fork 此儲存庫**：點擊儲存庫頁面右上方的「Fork」按鈕，在您的 GitHub 帳號下建立項目副本。
- **Create a new branch**: In your forked repository, create a new branch for your work. Use a descriptive name for the branch that reflects the purpose of your changes (e.g., `fix/issue-123` or `feature/add-new-tool`). | - **建立新分支**：在您 Fork 的儲存庫中，為您的工作建立新分支。使用反映變更目的的描述性分支名稱（例如 `fix/issue-123` 或 `feature/add-new-tool`）。
- **Make your changes**: Implement your changes in the new branch. Follow the existing code style and conventions used in the project. Be sure to test your changes locally to ensure they work as expected. | - **進行變更**：在新分支中實作您的變更。遵循項目中既有的程式碼風格與慣例。務必在本地測試變更以確保其按預期運作。
- **Add Release Notes**: If your changes include new features, bug fixes, or improvements, please see the "Release Notes" section below to properly document your contribution for the next release. | - **新增發布說明**：若您的變更包含新功能、錯誤修復或改進，請參閱下方的「發布說明」章節，為下次發布妥善記錄您的貢獻。
- **Conventional Commits**: When committing your changes, please use conventional commit messages to provide clear and consistent commit history. The format is `<type>(<scope>): <description>`, where: | - **Conventional Commits**：提交變更時，請使用慣例提交訊息來提供清晰且一致的提交歷史。格式為 `<type>(<scope>): <description>`，其中：
  - `type` is the type of change (e.g., `feat` for new features, `fix` for bug fixes, `docs` for documentation changes, etc.) |   - `type` 是變更類型（例如，新功能用 `feat`，錯誤修復用 `fix`，文件變更用 `docs` 等）
  - `scope` is an optional area of the codebase that your change affects (e.g., `api`, `ui`, `docs`, etc.) |   - `scope` 是您的變更影響的程式碼區域（例如 `api`、`ui`、`docs` 等）
  - `description` is a brief summary of the change |   - `description` 是變更的簡短摘要
- **Submit a pull request**: Once your changes are ready, submit a pull request to the main repository. Provide a clear description of your changes and reference any related issues. The project maintainers will review your pull request and may provide feedback or request changes before it can be merged. | - **提交 Pull Request**：變更準備就緒後，向主儲存庫提交 Pull Request。清楚描述您的變更並參照任何相關 Issue。項目維護者將審查您的 Pull Request，並可能在合併前提供回饋或要求變更。
- **Be responsive to feedback**: If the maintainers request changes or provide feedback on your pull request, please respond in a timely manner. Stale pull requests may be closed if there is no activity for an extended period. | - **及時回饋**：若維護者要求變更或對您的 Pull Request 提供回饋，請及時回應。若長期無活動，過時的 Pull Request 可能會被關閉。
- **Follow the project's code of conduct**: Please adhere to the project's code of conduct when interacting with maintainers and other contributors. Be respectful and considerate in your communications. | - **遵循行為準則**：與維護者和其他貢獻者互動時，請遵循項目的行為準則。在溝通中保持尊重與體貼。
- **No guarantee of acceptance**: The project is community-driven, and all contributions are appreciated, but acceptance is not guaranteed. The maintainers will evaluate each contribution based on its quality, relevance, and alignment with the project's goals. | - **不保證接受**：本項目由社群驅動，所有貢獻均受感謝，但不保證接受。維護者將根據質量、相關性與項目目標評估每項貢獻。
- **Thank you for contributing to Project N.O.M.A.D.!** Your efforts help make this project better for everyone. | - **感謝您為計畫 N.O.M.A.D. 做出貢獻！」您的努力讓這個項目對每個人來說都變得更好。

### Versioning
This project uses semantic versioning. The version is managed in the root `package.json`
and automatically updated by semantic-release. For simplicity's sake, the "project-nomad" image
uses the same version defined there instead of the version in `admin/package.json` (stays at 0.0.0), as it's the only published image derived from the code. | ### 版本控制
本項目使用語意版本控制。版本在根目錄的 `package.json` 中管理，並由 semantic-release 自動更新。為簡化起見，「project-nomad」映像檔使用該處定義的相同版本，而非 `admin/package.json` 中的版本（保持在 0.0.0），因為這是唯一從程式碼發布的映像檔。

### Release Notes
Human-readable release notes live in [`admin/docs/release-notes.md`](admin/docs/release-notes.md) and are displayed in the Command Center's built-in documentation. | ### 發布說明
人類可讀的發布說明位於 [`admin/docs/release-notes.md`](admin/docs/release-notes.md)，並顯示於指揮中心的內建文件中。

When working on changes, add a summary to the `## Unreleased` section at the top of that file under the appropriate heading: | 進行變更時，請將摘要新增至該檔案頂部 `## Unreleased` 區段下的適當標題：

- **Features** — new user-facing capabilities | - **Features（功能）」 — 新的使用者可見功能
- **Bug Fixes** — corrections to existing behavior | - **Bug Fixes（錯誤修復）」 — 現有行為的修正
- **Improvements** — enhancements, refactors, docs, or dependency updates | - **Improvements（改進）」 — 增強、重構、文件或依賴更新

Use the format `- **Area**: Description` to stay consistent with existing entries. When a release is triggered, CI automatically stamps the version and date, commits the update, and pushes the content to the GitHub release. | 使用格式 `- **領域**：描述` 以與現有條目保持一致。觸發發布時，CI 會自動標記版本與日期、提交更新並將內容推送到 GitHub 發布。

## Community & Resources | ## 社群與資源

- **Website:** [www.projectnomad.us](https://www.projectnomad.us) - Learn more about the project | - **網站：** [www.projectnomad.us](https://www.projectnomad.us) - 瞭解更多關於本項目
- **Discord:** [Join the Community](https://discord.com/invite/crosstalksolutions) - Get help, share your builds, and connect with other NOMAD users | - **Discord：** [加入社群](https://discord.com/invite/crosstalksolutions) - 獲得協助、分享您的建置並與其他 NOMAD 用戶建立連結
- **Benchmark Leaderboard:** [benchmark.projectnomad.us](https://benchmark.projectnomad.us) - See how your hardware stacks up against other NOMAD builds | - **效能測試排行榜：** [benchmark.projectnomad.us](https://benchmark.projectnomad.us) - 查看您的硬體與其他 NOMAD 建置的比較

## License | ## 授權條款

Project N.O.M.A.D. is licensed under the [Apache License 2.0](LICENSE). | 計畫 N.O.M.A.D. 採用 [Apache License 2.0](LICENSE) 授權。

## Helper Scripts
Once installed, Project N.O.M.A.D. has a few helper scripts should you ever need to troubleshoot issues or perform maintenance that can't be done through the Command Center. All of these scripts are found in Project N.O.M.A.D.'s install directory, `/opt/project-nomad` | ## 輔助腳本
安裝完成後，計畫 N.O.M.A.D. 提供一些輔助腳本，以協助您排除故障或執行無法透過指揮中心完成的維護工作。所有這些腳本皆位於計畫 N.O.M.A.D. 的安裝目錄 `/opt/project-nomad` 中。

###

###### Start Script - Starts all installed project containers | ###### 啟動腳本 - 啟動所有已安裝的項目容器
```bash
sudo bash /opt/project-nomad/start_nomad.sh
```
###

###### Stop Script - Stops all installed project containers | ###### 停止腳本 - 停止所有已安裝的項目容器
```bash
sudo bash /opt/project-nomad/stop_nomad.sh
```
###

###### Update Script - Attempts to pull the latest images for the Command Center and its dependencies (i.e. mysql) and recreate the containers. Note: this *only* updates the Command Center containers. It does not update the installable application containers - that should be done through the Command Center UI | ###### 更新腳本 - 嘗試拉取指揮中心及其依賴項（例如 mysql）的最新映像檔並重建容器。注意：這*僅*更新指揮中心容器。不更新可安裝的應用程式容器 — 應透過指揮中心介面執行更新
```bash
sudo bash /opt/project-nomad/update_nomad.sh
```

###### Uninstall Script - Need to start fresh? Use the uninstall script to make your life easy. Note: this cannot be undone! | ###### 解除安裝腳本 - 需要重新開始？使用解除安裝腳本讓您輕鬆完成。注意：此操作無法復原！
```bash
curl -fsSL https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/main/install/uninstall_nomad.sh -o uninstall_nomad.sh && sudo bash uninstall_nomad.sh
```
