#!/usr/bin/env python3
"""Protocol fixture for subprocess failure, cancellation, and timeout tests."""
import json
import os
import sys

pending = {}


def send(message):
    print(json.dumps(message), flush=True)


for line in sys.stdin:
    query = json.loads(line)
    if query.get("action") == "query_version":
        send({"id": query["id"], "version": "test-engine"})
    elif query.get("action") == "terminate":
        original = pending.pop(query["terminateId"], None)
        if original:
            for turn in original.get("analyzeTurns", [len(original["moves"])]):
                send({"id": original["id"], "turnNumber": turn, "isDuringSearch": False, "noResults": True})
        send(query)
    elif query.get("moves") == [["B", "crash"]]:
        os._exit(7)
    else:
        pending[query["id"]] = query
