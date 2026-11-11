#!/usr/bin/env python3
""".memo/source.csv を正規化して data/drops.json を生成する。

使い方:  python scripts/build_data.py [入力CSV] [出力JSON]
既定値:  .memo/source.csv -> data/drops.json  (標準ライブラリのみ)
"""
import csv
import json
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JST = timezone(timedelta(hours=9))
WORD_COLS = [f"word{i}_jp" for i in range(1, 6)]


def split_tenants(raw, atomic):
    """'a-b' 形式の複合テナントを、単独で存在するテナントID同士に分解する。"""
    if raw in atomic:
        return [raw]
    for i, ch in enumerate(raw):
        if ch == "-":
            head, tail = raw[:i], raw[i + 1:]
            if head in atomic:
                rest = split_tenants(tail, atomic)
                if all(t in atomic for t in rest):
                    return [head] + rest
    return [raw]


def find_atomic(raws):
    """他のテナントIDの連結で表現できないIDを単独テナントとみなす。"""
    atomic = set(raws)
    for raw in sorted(raws, key=len, reverse=True):
        others = atomic - {raw}
        parts = split_tenants(raw, others)
        if len(parts) > 1:
            atomic.discard(raw)
    return atomic


def norm_date(value):
    value = value.strip()
    for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(value, fmt).replace(microsecond=0, tzinfo=JST).isoformat()
        except ValueError:
            pass
    raise ValueError(f"post_date を解釈できません: {value!r}")


def norm_coord(lat, lng):
    try:
        lat, lng = round(float(lat), 6), round(float(lng), 6)
    except ValueError:
        return None, None
    if not (20 <= lat <= 46 and 122 <= lng <= 154):  # 日本国外は位置情報なし扱い
        return None, None
    return lat, lng


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / ".memo" / "source.csv"
    dst = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "data" / "drops.json"
    with src.open(encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))

    atomic = find_atomic({r["tenant"].strip() for r in rows})
    drops, seen = [], set()
    for r in rows:
        rid = r["artwork_id"].strip()
        if not rid or rid in seen:
            continue
        seen.add(rid)
        phrases = [" ".join(r[c].split()) for c in WORD_COLS]
        phrases = [p for p in phrases if p]
        if not phrases and r["sentence_jp"].strip():
            phrases = [" ".join(r["sentence_jp"].split())]
        lat, lng = norm_coord(r["latitude"], r["longitude"])
        raw = r["tenant"].strip()
        drops.append({
            "id": rid,
            "tenants": split_tenants(raw, atomic),
            "tenant_raw": raw,
            "account": r["account_name"].strip(),
            "image": r["image_file_path"].strip(),
            "thumb": r["image_file_path_thumbnail"].strip() or r["image_file_path"].strip(),
            "lat": lat,
            "lng": lng,
            "phrases": phrases,
            "posted_at": norm_date(r["post_date"]),
        })
    drops.sort(key=lambda d: d["posted_at"], reverse=True)

    counts = Counter(t for d in drops for t in d["tenants"])
    out = {
        "meta": {
            "generated_at": datetime.now(JST).replace(microsecond=0).isoformat(),
            "count": len(drops),
            "tenants": [{"id": t, "count": c} for t, c in sorted(counts.items(), key=lambda x: (-x[1], x[0]))],
        },
        "drops": drops,
    }
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(drops)} 件 / {len(counts)} テナント -> {dst}")
    for t in out["meta"]["tenants"]:
        print(f"  {t['id']}: {t['count']}")
    multi = Counter(d["tenant_raw"] for d in drops if len(d["tenants"]) > 1)
    for raw, c in multi.items():
        print(f"  [複合] {raw} ({c}件) -> {' + '.join(split_tenants(raw, atomic))}")


if __name__ == "__main__":
    main()
