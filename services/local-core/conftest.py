import sys
from pathlib import Path

# Add services/local-core directory to sys.path so 'app' can be imported cleanly
sys.path.insert(0, str(Path(__file__).parent))
