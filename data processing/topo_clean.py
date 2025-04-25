import json

def clean_name_field(data):
    if isinstance(data, dict):
        # If key is 'name' and ends with ' name', remove it
        for key in data:
            if key == "name" and isinstance(data[key], str):
                if data[key].endswith(" name"):
                    data[key] = data[key][:-5]  # Remove ' name'
            else:
                # Recurse into nested dicts/lists
                clean_name_field(data[key])
    elif isinstance(data, list):
        for item in data:
            clean_name_field(item)

def main():
    # Load the original JSON
    with open("input.json", "r", encoding="utf-8") as f:
        data = json.load(f)

    # Clean the "name" fields
    clean_name_field(data)

    # Save the cleaned JSON
    with open("output.json", "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print("Cleaned JSON written to output.json")

if __name__ == "__main__":
    main()
