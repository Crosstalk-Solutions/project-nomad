#!/usr/bin/env python3
"""Calculate car and walking routes on an installed graph with --network none."""

import argparse
import json

import router_broker as broker


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('package_id')
    parser.add_argument('package_version')
    parser.add_argument('--namespace', choices=('packs', 'regions'), default='packs')
    parser.add_argument('--point', action='append', nargs=2, type=float, metavar=('LAT', 'LON'), required=True)
    args = parser.parse_args()
    if not 2 <= len(args.point) <= 7:
        parser.error('provide two to seven --point LAT LON arguments in trip order')

    locations = [{'lat': lat, 'lon': lon} for lat, lon in args.point]
    results = []
    try:
        for profile in ('auto', 'pedestrian'):
            status, response = broker.route_request({
                'packageId': args.package_id,
                'packageVersion': args.package_version,
                'namespace': args.namespace,
                'request': {'costing': profile, 'locations': locations, 'language': 'en-US'},
            })
            trip = response.get('trip', {})
            if status != 200 or trip.get('status') != 0:
                raise RuntimeError(f'{profile} route failed ({status}): {response.get("message", trip)}')
            summary = trip['summary']
            legs = len(trip['legs'])
            if summary['length'] <= 0 or summary['time'] <= 0 or legs != len(locations) - 1:
                raise RuntimeError(f'{profile} route returned invalid totals or leg count')
            results.append({
                'profile': profile,
                'distanceKm': summary['length'],
                'seconds': summary['time'],
                'legs': legs,
            })
    except (ValueError, broker.BrokerError, RuntimeError) as error:
        raise SystemExit(str(error)) from error
    finally:
        broker.stop_engine()
    print('OFFLINE_SMOKE_RESULT=' + json.dumps(results), flush=True)


if __name__ == '__main__':
    main()
