const getInventoryMovementColumnSet = async (conn) => {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'inventory_movements'`
  );
  return new Set(rows.map((row) => row.COLUMN_NAME));
};

export const insertInventoryMovementsTx = async (conn, movements = []) => {
  if (!movements.length) return 0;

  const columns = await getInventoryMovementColumnSet(conn);

  const prepared = movements.map((m) => ({
    item_type: m.item_type,
    item_id: m.item_id,
    qty: m.qty ?? 1,
    movement_type: m.movement_type,
    reference_type: m.reference_type ?? null,
    reference_id: m.reference_id ?? null,
    client_id: m.client_id ?? null,
    unit_price: m.unit_price ?? null,
    amount: m.amount ?? null,
    note: m.note ?? null,
    created_by_role: m.created_by_role ?? null,
    created_by: m.created_by ?? null,
  }));

  const keys = Object.keys(prepared[0]).filter((key) => columns.has(key));
  const placeholders = `(${keys.map(() => "?").join(", ")})`;
  const allPlaceholders = prepared.map(() => placeholders).join(", ");
  const values = prepared.flatMap((row) => keys.map((k) => row[k]));

  const [result] = await conn.query(
    `INSERT INTO inventory_movements (${keys.join(", ")}) VALUES ${allPlaceholders}`,
    values
  );

  return result.affectedRows || 0;
};

