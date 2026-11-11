#!/usr/bin/env python3
"""Build the bundled routing catalog from Geofabrik's public download index."""

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
from urllib.request import urlopen

INDEX = 'https://download.geofabrik.de/index-v1.json'
ATTRIBUTION = '© OpenStreetMap contributors, ODbL 1.0. Extracts by Geofabrik.'


def region_id(value):
    return re.sub(r'[^a-z0-9_-]', '-', value.lower())


def bounds(geometry):
    points = []

    def collect(value):
        if len(value) >= 2 and isinstance(value[0], (float, int)):
            points.append(value[:2])
        else:
            for child in value:
                collect(child)

    collect(geometry['coordinates'])
    longitudes, latitudes = zip(*points)
    return [min(longitudes), min(latitudes), max(longitudes), max(latitudes)]


def build(index, updated_at):
    if index.get('type') != 'FeatureCollection':
        raise ValueError('Expected a Geofabrik GeoJSON FeatureCollection')
    world = {'id': 'world', 'name': 'World', 'coverage': {'bbox': [-180, -90, 180, 90]}, 'sources': {}}
    regions = [world]
    for feature in index['features']:
        properties = feature['properties']
        geometry = feature.get('geometry')
        pbf = properties.get('urls', {}).get('pbf')
        if not geometry or not pbf:
            continue
        regions.append({
            'id': region_id(properties['id']),
            'name': properties['name'],
            'parentId': region_id(properties.get('parent') or 'world'),
            'coverage': {'bbox': bounds(geometry), 'polygon': geometry},
            'sources': {'routing': {'url': pbf, 'format': 'osm-pbf', 'sourceId': 'geofabrik'}},
            'attribution': ATTRIBUTION,
        })
    ids = {region['id'] for region in regions}
    if len(ids) != len(regions) or len(regions) <= 1:
        raise ValueError('The download index must contain distinct public routing regions')
    for region in regions[1:]:
        if region['parentId'] not in ids:
            region['parentId'] = 'world'
    world['collectionChildren'] = [
        region['id'] for region in regions[1:] if region['parentId'] == 'world'
    ]
    return {'schema_version': 2, 'updatedAt': updated_at, 'sourceUrl': INDEX, 'regions': regions}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--index-file', type=Path, help='Use a previously downloaded index')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--updated-at', help='UTC timestamp to retain when regenerating a snapshot')
    args = parser.parse_args()
    if args.index_file:
        index = json.loads(args.index_file.read_text(encoding='utf-8'))
    else:
        with urlopen(INDEX, timeout=60) as response:
            index = json.load(response)
    updated_at = args.updated_at or datetime.now(timezone.utc).isoformat()
    catalog = build(index, updated_at)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(catalog, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8'
    )
    print(json.dumps({'regions': len(catalog['regions']), 'bytes': args.output.stat().st_size}))


if __name__ == '__main__':
    main()
