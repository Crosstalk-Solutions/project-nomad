"""Print the worker catalog used by the admin application while offline."""

import json

from world_pack import world_catalog


if __name__ == "__main__":
    print(json.dumps(world_catalog(), ensure_ascii=False, indent=2))
