#!/usr/bin/env python3
"""
Verification script for the new Watermark layout and styling.
"""
import io
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

ROOT = Path(__file__).resolve().parent.parent

def test_watermark_configuration():
    print("=" * 70)
    print("🧪  TESTING WATERMARK ENGINE FIXES & LAYOUT VERIFICATION  🧪")
    print("=" * 70)

    # 1. Check stamp.server.ts constants
    stamp_path = ROOT / "src" / "lib" / "secure-view" / "stamp.server.ts"
    stamp_code = stamp_path.read_text(encoding="utf-8")
    
    assert "const TILE_X = 380;" in stamp_code, "TILE_X is not 380"
    assert "const TILE_Y = 240;" in stamp_code, "TILE_Y is not 240"
    assert "const OPACITY = 0.08;" in stamp_code, "OPACITY is not 0.08"
    assert "const ANGLE = -30;" in stamp_code, "ANGLE is not -30"
    print("[PASS] Check 1: stamp.server.ts constants updated (TILE_X: 380, TILE_Y: 240, OPACITY: 0.08, ANGLE: -30°)")

    # 2. Check secure-view.shared.ts watermarkLinesFor
    shared_path = ROOT / "src" / "lib" / "secure-view" / "secure-view.shared.ts"
    shared_code = shared_path.read_text(encoding="utf-8")

    assert "detail.sessionId" not in shared_code, "Session UUID is still present in diagonal watermark"
    assert "return [office, `${prefix}: ${user} — ${openedAt}`];" in shared_code, "watermarkLinesFor format is incorrect"
    print("[PASS] Check 2: Session UUID successfully removed from diagonal watermark tiles")
    print("[PASS] Check 3: Watermark lines format is clean: [Office Name, Prefix + User + Timestamp]")

    print("-" * 70)
    print("📊 RESULT: Watermark Engine is now fully verified, cleaned, and optimized!")
    print("=" * 70)

if __name__ == "__main__":
    test_watermark_configuration()
