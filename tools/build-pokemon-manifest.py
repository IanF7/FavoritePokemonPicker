from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parent.parent
IMAGES_DIR = ROOT / "images"
NORMAL_DIR = IMAGES_DIR / "sprites"
SHINY_DIR = IMAGES_DIR / "sprites shiny"
OUT_DIR = ROOT / "data"
OUT_FILE = OUT_DIR / "pokemon.json"

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp"}


def read_text(path):
    return path.read_text(encoding="utf-8") if path.exists() else ""


def parse_pbs(text):
    entries = []
    matches = list(re.finditer(r"^\[([^\]]+)\]\s*$", text, re.MULTILINE))

    for i, match in enumerate(matches):
        entry_id = match.group(1).strip()
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[start:end]

        fields = {}
        for line in body.splitlines():
            field_match = re.match(r"^([^#=\s][^=]*?)\s*=\s*(.*)$", line)
            if field_match:
                fields[field_match.group(1).strip()] = field_match.group(2).strip()

        entries.append({"id": entry_id, "fields": fields})

    return entries


def sprite_files(folder):
    if not folder.exists():
        return {}

    return {
        file.stem.upper(): file.name
        for file in folder.iterdir()
        if file.is_file() and file.suffix.lower() in IMAGE_EXTENSIONS
    }


def normalize_base_id(value):
    return re.sub(r"[^A-Z0-9]", "", value.upper())


def sprite_stem_candidates(base_id, form_number=None):
    clean = normalize_base_id(base_id)

    special = {
        "NIDORANMA": "NIDRORANma",
        "NIDORANM": "NIDRORANma",
        "NIDORANFE": "NIDORANfE",
        "NIDORANF": "NIDORANfE",
    }

    base_stem = special.get(clean, clean)

    if form_number is None:
        return [base_stem, clean]

    return [
        f"{base_stem}_{form_number}",
        f"{clean}_{form_number}",
    ]


def find_sprite(normal_sprites, shiny_sprites, base_id, form_number=None):
    normal_file = None
    shiny_file = None

    for candidate in sprite_stem_candidates(base_id, form_number):
        key = candidate.upper()

        if normal_file is None and key in normal_sprites:
            normal_file = normal_sprites[key]

        if shiny_file is None and key in shiny_sprites:
            shiny_file = shiny_sprites[key]

    return {
        "normal": f"images/sprites/{normal_file}" if normal_file else None,
        "shiny": f"images/sprites%20shiny/{shiny_file}" if shiny_file else None,
    }


def display_form_name(base_name, form_fields, form_number):
    form_name = (
        form_fields.get("FormName")
        or form_fields.get("Form")
        or form_fields.get("Name")
        or ""
    )

    if not form_name:
        return f"{base_name} Form {form_number}"

    if base_name.lower() in form_name.lower():
        return form_name

    return f"{base_name} {form_name}"


pokemon_entries = parse_pbs(read_text(IMAGES_DIR / "pokemon.txt"))
form_entries = parse_pbs(read_text(IMAGES_DIR / "pokemonforms.txt"))

normal_sprites = sprite_files(NORMAL_DIR)
shiny_sprites = sprite_files(SHINY_DIR)

forms_by_base = {}

for entry in form_entries:
    raw = entry["id"]
    base_id = raw
    form_number = None

    if "," in raw:
        parts = raw.split(",", 1)
        base_id = parts[0].strip()
        form_number = parts[1].strip()
    elif "_" in raw:
        parts = raw.split("_", 1)
        base_id = parts[0].strip()
        form_number = parts[1].strip()

    if not form_number:
        continue

    key = normalize_base_id(base_id)
    forms_by_base.setdefault(key, []).append({
        "formNumber": form_number,
        "fields": entry["fields"],
    })


result = []

for entry in pokemon_entries:
    base_id = normalize_base_id(entry["id"])
    base_name = entry["fields"].get("Name", entry["id"])

    sprite = find_sprite(normal_sprites, shiny_sprites, entry["id"])

    result.append({
        "id": base_id,
        "dexId": len(result) + 1,
        "speciesId": base_id,
        "formNumber": None,
        "name": base_name,
        "sortGroup": base_id,
        "sprite": sprite["normal"],
        "shinySprite": sprite["shiny"],
    })

    forms = forms_by_base.get(base_id, [])
    forms.sort(key=lambda item: int(item["formNumber"]) if item["formNumber"].isdigit() else item["formNumber"])

    for form in forms:
        sprite = find_sprite(normal_sprites, shiny_sprites, entry["id"], form["formNumber"])

        result.append({
            "id": f"{base_id}_{form['formNumber']}",
            "dexId": len(result) + 1,
            "speciesId": base_id,
            "formNumber": form["formNumber"],
            "name": display_form_name(base_name, form["fields"], form["formNumber"]),
            "sortGroup": base_id,
            "sprite": sprite["normal"],
            "shinySprite": sprite["shiny"],
        })


OUT_DIR.mkdir(exist_ok=True)
OUT_FILE.write_text(json.dumps(result, indent=2), encoding="utf-8")

print(f"Wrote {len(result)} Pokémon/forms to {OUT_FILE}")