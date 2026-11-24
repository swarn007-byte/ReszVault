#!/usr/bin/env python
import os
import sys
from pathlib import Path

from django.core.management import execute_from_command_line

if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "settings")
    execute_from_command_line(sys.argv)
