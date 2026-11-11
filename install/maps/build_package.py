#!/usr/bin/env python3
"""Prepare a standalone routing graph with NOMAD's native builder."""

import argparse
import json
import re
from uuid import uuid4

import map_regions_builder as builder


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', help='OSM PBF path under sources/, relative to MAP_REGIONS_PATH')
    parser.add_argument('output', help='routing.tar path under a fresh staging/ directory')
    parser.add_argument('source_sha256', help='Expected SHA-256 of the source file')
    args = parser.parse_args()
    if not re.fullmatch(r'[0-9a-fA-F]{64}', args.source_sha256):
        parser.error('source_sha256 must contain 64 hexadecimal digits')
    try:
        source = builder.local_path(args.source, 'sources')
        output = builder.local_path(args.output, 'staging')
    except ValueError as error:
        parser.error(str(error))
    if not source.is_file():
        parser.error('source must be an existing OSM PBF file')
    if output.name != 'routing.tar' or output.parent == builder.ROOT / 'staging':
        parser.error('output must be staging/<directory>/routing.tar')
    if output.parent.exists():
        parser.error('output directory must be new')

    job_id = 'package-' + uuid4().hex
    builder.build({
        'jobId': job_id,
        'component': 'routing',
        'source': {
            'relativePath': args.source,
            'format': 'osm-pbf',
            'sha256': args.source_sha256.lower(),
        },
        'outputRelativePath': args.output,
    })
    result = json.loads((builder.JOBS / (job_id + '.json')).read_text())
    if result['status'] != 'completed':
        raise SystemExit(result.get('error', 'Routing graph preparation did not complete.'))
    print(json.dumps(result['artifact']))


if __name__ == '__main__':
    main()
