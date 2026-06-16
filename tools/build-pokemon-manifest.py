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


def normalize_sprite_part(value):
    return re.sub(r"[^A-Z0-9_]", "", value.upper())


def parse_form_id(raw_id):
    raw_id = raw_id.strip()

    if "," in raw_id:
        base_id, form_id = raw_id.split(",", 1)
        return base_id.strip(), form_id.strip()

    if "_" in raw_id:
        base_id, form_id = raw_id.split("_", 1)
        return base_id.strip(), form_id.strip()

    return raw_id, None


def sprite_suffix_for_form(form_id):
    if form_id is None:
        return None

    form_id = form_id.strip()

    if form_id.upper().startswith("G"):
        return normalize_sprite_part(form_id)

    return normalize_sprite_part(form_id)


def sprite_stem_candidates(base_id, form_id=None):
    clean = normalize_base_id(base_id)

    special = {
        "NIDORANMA": "NIDRORANma",
        "NIDORANM": "NIDRORANma",
        "NIDORANFE": "NIDORANfE",
        "NIDORANF": "NIDORANfE",
    }

    base_stem = special.get(clean, clean)

    if form_id is None:
        return [base_stem, clean]

    suffix = sprite_suffix_for_form(form_id)

    candidates = [
        f"{base_stem}_{suffix}",
        f"{clean}_{suffix}",
    ]

    if clean == "BASCULEGION" and suffix == "FEMALE":
        candidates.insert(0, "BASCULEGION_FEMALE")

    return candidates


def find_sprite(normal_sprites, shiny_sprites, base_id, form_id=None):
    normal_file = None
    shiny_file = None

    for candidate in sprite_stem_candidates(base_id, form_id):
        key = candidate.upper()

        if normal_file is None and key in normal_sprites:
            normal_file = normal_sprites[key]

        if shiny_file is None and key in shiny_sprites:
            shiny_file = shiny_sprites[key]

    return {
        "normal": f"images/sprites/{normal_file}" if normal_file else None,
        "shiny": f"images/sprites%20shiny/{shiny_file}" if shiny_file else None,
    }


def display_form_name(base_name, form_fields, form_id):
    form_name = (
        form_fields.get("FormName")
        or form_fields.get("Form")
        or form_fields.get("Name")
        or ""
    )

    if form_name:
        if base_name.lower() in form_name.lower():
            return form_name

        return f"{base_name} {form_name}"

    if form_id and form_id.upper().startswith("G"):
        if "_" in form_id:
            variant = form_id.split("_", 1)[1]
            return f"{base_name} Gigantamax {variant}"

        return f"{base_name} Gigantamax"

    return f"{base_name} Form {form_id}"


def form_sort_key(form):
    form_id = str(form["formId"]).strip()
    upper = form_id.upper()

    if upper == "G":
        return (9998, 0, "")

    if upper.startswith("G_"):
        suffix = upper.split("_", 1)[1]

        if suffix.isdigit():
            return (9998, int(suffix), "")

        return (9998, 9999, suffix)

    if form_id.isdigit():
        return (int(form_id), 0, "")

    return (9999, 0, upper)


pokemon_entries = parse_pbs(read_text(IMAGES_DIR / "pokemon.txt"))
form_entries = parse_pbs(read_text(IMAGES_DIR / "pokemonforms.txt"))

normal_sprites = sprite_files(NORMAL_DIR)
shiny_sprites = sprite_files(SHINY_DIR)

forms_by_base = {}

for entry in form_entries:
    base_id, form_id = parse_form_id(entry["id"])

    if not form_id:
        continue

    key = normalize_base_id(base_id)

    forms_by_base.setdefault(key, []).append({
        "formId": form_id,
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
    forms.sort(key=form_sort_key)

    for form in forms:
        form_id = form["formId"]
        sprite = find_sprite(normal_sprites, shiny_sprites, entry["id"], form_id)

        result.append({
            "id": f"{base_id}_{normalize_sprite_part(form_id)}",
            "dexId": len(result) + 1,
            "speciesId": base_id,
            "formNumber": form_id,
            "name": display_form_name(base_name, form["fields"], form_id),
            "sortGroup": base_id,
            "sprite": sprite["normal"],
            "shinySprite": sprite["shiny"],
        })


OUT_DIR.mkdir(exist_ok=True)
OUT_FILE.write_text(json.dumps(result, indent=2), encoding="utf-8")

print(f"Wrote {len(result)} Pokémon/forms to {OUT_FILE}")