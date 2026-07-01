const IST_OFFSET_MINUTES = 330;

const isDateLikeString = (value) => {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;

  // ISO 8601 with time
  if (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})?$/.test(
      trimmed
    )
  ) {
    return true;
  }

  // MySQL datetime without timezone
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    return true;
  }

  return false;
};

const parseAsUtcDate = (value) => {
  if (value instanceof Date) return value;
  const trimmed = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    // Treat MySQL datetime as UTC
    return new Date(trimmed.replace(" ", "T") + "Z");
  }

  return new Date(trimmed);
};

const toIstString = (value) => {
  if (!value) return value;
  if (typeof value === "string" && value.includes("+05:30")) return value;
  const date = parseAsUtcDate(value);
  if (Number.isNaN(date.getTime())) return value;
  const istDate = new Date(date.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
  return istDate.toISOString().replace("Z", "+05:30");
};

const shouldTransformKey = (key) =>
  typeof key === "string" && (key.endsWith("_at") || key.endsWith("_time"));

const isPlainObject = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.prototype.toString.call(value) === "[object Object]";

export const convertDatesToIst = (input) => {
  const seen = new WeakSet();

  const walk = (value, parentKey = null) => {
    if (value === null || value === undefined) return value;

    if (value instanceof Date) {
      return toIstString(value);
    }

    if (typeof value === "string") {
      if (isDateLikeString(value) && (!parentKey || shouldTransformKey(parentKey))) {
        return toIstString(value);
      }
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => walk(item, parentKey));
    }

    if (!isPlainObject(value)) {
      return value;
    }

    if (seen.has(value)) return value;
    seen.add(value);

    const result = {};
    for (const [key, val] of Object.entries(value)) {
      if (isDateLikeString(val) && shouldTransformKey(key)) {
        result[key] = toIstString(val);
      } else {
        result[key] = walk(val, key);
      }
    }
    return result;
  };

  return walk(input);
};

