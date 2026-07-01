import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

const formatDate = (value) => {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString();
};

const formatMoney = (value) => {
    const num = Number(value || 0);
    return `₹${num.toFixed(2)}`;
};

const ensureString = (value) => {
    if (value === undefined || value === null) return "";
    return String(value);
};

export const generateInvoicePDF = async (
    invoice,
    client,
    agreement,
    breakdown = null,
    invoiceLineItems = null
) => {
    return new Promise((resolve, reject) => {
        try {
            const fileName = `${invoice.invoice_unique_id}.pdf`;

            const uploadDir = path.join(process.cwd(), "src/public/uploads/invoices");
            fs.mkdirSync(uploadDir, { recursive: true });

            const filePath = path.join(uploadDir, fileName);

            const doc = new PDFDocument({ size: "A4", margin: 0 });
            const stream = fs.createWriteStream(filePath);
            doc.pipe(stream);

            const fontRegular = path.join(
                process.cwd(),
                "src/public/fonts/NotoSans-Regular.ttf"
            );
            const fontBold = path.join(
                process.cwd(),
                "src/public/fonts/NotoSans-Bold.ttf"
            );
            const logoPath = path.join(process.cwd(), "src/public/logo.png");

            const primary = "#3A6FE2";
            const lightGray = "#f5f6f8";
            const textDark = "#2c2c2c";
            const midGray = "#666";

            const safeLineItems = Array.isArray(invoiceLineItems)
                ? invoiceLineItems
                : null;

            const safeBreakdown =
                safeLineItems && safeLineItems.length
                    ? null
                    : breakdown || {
                        systems: [],
                        assets: [],
                        gsm_gateways: [],
                        servers: [],
                        totals: null,
                    };

            const lineTotals =
                safeLineItems && safeLineItems.length
                    ? safeLineItems.reduce((sum, li) => sum + Number(li?.amount || 0), 0)
                    : null;

            const sectionTotals = safeBreakdown?.totals || {
                systems: safeBreakdown
                    ? (safeBreakdown.systems || []).reduce(
                        (s, r) => s + Number(r?.system_price || 0),
                        0
                    )
                    : 0,
                assets: safeBreakdown
                    ? (safeBreakdown.assets || []).reduce(
                        (s, r) => s + Number(r?.asset_price || 0),
                        0
                    )
                    : 0,
                gsm_gateways: safeBreakdown
                    ? (safeBreakdown.gsm_gateways || []).reduce(
                        (s, r) => s + Number(r?.total_price || 0),
                        0
                    )
                    : 0,
                servers: safeBreakdown
                    ? (safeBreakdown.servers || []).reduce(
                        (s, r) => s + Number(r?.total_price || 0),
                        0
                    )
                    : 0,
            };
            sectionTotals.rent =
                safeLineItems && safeLineItems.length
                    ? Number(lineTotals || 0)
                    : Number(sectionTotals.systems || 0) +
                    Number(sectionTotals.assets || 0) +
                    Number(sectionTotals.gsm_gateways || 0) +
                    Number(sectionTotals.servers || 0);

            const drawHeader = (title = "INVOICE") => {
                doc.rect(0, 0, 595, 90).fill(primary);

                // Brand (logo + name)
                const brandX = 50;
                const brandY = 24;
                const logoSize = 42;
                try {
                    if (fs.existsSync(logoPath)) {
                        doc.image(logoPath, brandX, brandY, {
                            fit: [logoSize, logoSize],
                            align: "left",
                            valign: "top",
                        });
                    }
                } catch {
                    // Ignore logo render errors; keep invoice generation working.
                }

                const nameX = brandX + logoSize + 10;
                doc
                    .fillColor("#fff")
                    .font(fontBold)
                    .fontSize(16)
                    .text("SWAGAT", nameX, 30);
                doc.font(fontRegular).fontSize(9).text("Rentals", nameX, 50);

                doc.rect(0, 90, 595, 650).fill(lightGray);
                doc
                    .fillColor(textDark)
                    .font(fontBold)
                    .fontSize(14)
                    .text(title, 0, 110, { align: "center" });
            };

            drawHeader("INVOICE");

            doc.font(fontRegular).fillColor("#555").fontSize(9);

            let y = 150;
            const pageBottom = 730;
            const ensureSpace = (needed = 20) => {
                if (y + needed <= pageBottom) return;
                doc.addPage({ size: "A4", margin: 0 });
                drawHeader("INVOICE");
                doc.font(fontRegular).fillColor("#555").fontSize(9);
                y = 150;
            };

            // Invoice info
            doc.text("Invoice Information", 60, y);
            doc.moveTo(60, y + 12).lineTo(250, y + 12).stroke("#ccc");
            doc.text(`Invoice No: ${invoice.invoice_unique_id}`, 60, y + 25);
            doc.text(
                `Invoice Month: ${formatDate(invoice.invoice_month || new Date())}`,
                60,
                y + 40
            );
            doc.text(`Due Date: ${formatDate(invoice.due_date)}`, 60, y + 55);
            doc.text(`Status: ${ensureString(invoice.status || "pending")}`, 60, y + 70);

            // Client details
            doc.text("Client Details", 320, y);
            doc.moveTo(320, y + 12).lineTo(520, y + 12).stroke("#ccc");
            doc.text(`Client Name: ${client.full_name}`, 320, y + 25);
            doc.text(`Mobile: ${client.phone_number || "-"}`, 320, y + 40);
            doc.text(`Email: ${client.email}`, 320, y + 55);
            if (client.company_name) {
                doc.text(`Company: ${client.company_name}`, 320, y + 70);
            }

            const safeAgreement =
                agreement && typeof agreement === "object" ? agreement : null;

            const showAgreementSection =
                !!safeAgreement &&
                (safeAgreement.agreement_id ||
                    safeAgreement.agreement_start_date ||
                    safeAgreement.agreement_end_date);

            // Agreement summary (only when agreement is provided)
            y += 110;
            if (showAgreementSection) {
                doc.text("Agreement", 60, y);
                doc.moveTo(60, y + 12).lineTo(520, y + 12).stroke("#ccc");
                doc
                    .fillColor(midGray)
                    .text(
                        `Start: ${formatDate(safeAgreement.agreement_start_date)}`,
                        60,
                        y + 25
                    );
                doc.text(
                    `End: ${formatDate(safeAgreement.agreement_end_date)}`,
                    220,
                    y + 25
                );
                doc.fillColor("#555");
                y += 55;
            } else {
                y += 15;
            }

            const drawSectionTitle = (title) => {
                ensureSpace(30);
                doc.fillColor(textDark).font(fontBold).fontSize(10).text(title, 60, y);
                y += 16;
                doc.moveTo(60, y).lineTo(520, y).stroke("#ddd");
                y += 10;
                doc.font(fontRegular).fillColor("#555").fontSize(9);
            };

            const drawRow = (cols) => {
                ensureSpace(18);
                cols.forEach((c) => {
                    doc.text(c.text, c.x, y, { width: c.w, align: c.align || "left" });
                });
                y += 14;
            };

            const hasLineItems = safeLineItems && safeLineItems.length;
            const lineItemsByType = hasLineItems
                ? safeLineItems.reduce((acc, li) => {
                    const t = ensureString(li?.item_type || "adjustment") || "adjustment";
                    if (!acc[t]) acc[t] = [];
                    acc[t].push(li);
                    return acc;
                }, {})
                : null;

            // Systems
            if (
                (hasLineItems && (lineItemsByType.system || []).length) ||
                (!hasLineItems && (safeBreakdown.systems || []).length)
            ) {
                drawSectionTitle("Systems");
                doc.fillColor("#666").font(fontBold).fontSize(9);
                drawRow([
                    { text: "System", x: 60, w: 310 },
                    { text: "Price", x: 430, w: 90, align: "right" },
                ]);
                doc.font(fontRegular).fillColor("#555").fontSize(9);
                const rows = hasLineItems ? lineItemsByType.system || [] : safeBreakdown.systems;
                for (const row of rows) {
                    const systemLabel = hasLineItems
                        ? ensureString(row?.description || "-")
                        : row?.system_uid ||
                        row?.system_uuid ||
                        (row?.system_id ? `#${row.system_id}` : "-");
                    drawRow([
                        { text: systemLabel, x: 60, w: 310 },
                        {
                            text: formatMoney(hasLineItems ? row?.amount || 0 : row?.system_price || 0),
                            x: 430,
                            w: 90,
                            align: "right",
                        },
                    ]);
                }
                ensureSpace(18);
                doc
                    .font(fontBold)
                    .fillColor(textDark)
                    .text(
                        `Systems Subtotal: ${formatMoney(
                            hasLineItems
                                ? (lineItemsByType.system || []).reduce(
                                    (s, r) => s + Number(r?.amount || 0),
                                    0
                                )
                                : sectionTotals.systems
                        )}`,
                        60,
                        y,
                        {
                            align: "right",
                            width: 460,
                        }
                    );
                y += 22;
                doc.font(fontRegular).fillColor("#555");
            }

            // Assets
            if (
                (hasLineItems && (lineItemsByType.asset || []).length) ||
                (!hasLineItems && (safeBreakdown.assets || []).length)
            ) {
                drawSectionTitle("Assets");
                doc.fillColor("#666").font(fontBold).fontSize(9);
                drawRow([
                    { text: "Asset", x: 60, w: 310 },
                    { text: "Price", x: 430, w: 90, align: "right" },
                ]);
                doc.font(fontRegular).fillColor("#555").fontSize(9);
                const rows = hasLineItems ? lineItemsByType.asset || [] : safeBreakdown.assets;
                for (const row of rows) {
                    const assetLabel = hasLineItems
                        ? ensureString(row?.description || "-")
                        : row?.serial_number || (row?.asset_id ? `#${row.asset_id}` : "-");
                    drawRow([
                        { text: assetLabel, x: 60, w: 310 },
                        {
                            text: formatMoney(hasLineItems ? row?.amount || 0 : row?.asset_price || 0),
                            x: 430,
                            w: 90,
                            align: "right",
                        },
                    ]);
                }
                ensureSpace(18);
                doc
                    .font(fontBold)
                    .fillColor(textDark)
                    .text(
                        `Assets Subtotal: ${formatMoney(
                            hasLineItems
                                ? (lineItemsByType.asset || []).reduce(
                                    (s, r) => s + Number(r?.amount || 0),
                                    0
                                )
                                : sectionTotals.assets
                        )}`,
                        60,
                        y,
                        { align: "right", width: 460 }
                    );
                y += 22;
                doc.font(fontRegular).fillColor("#555");
            }

            // GSM Gateways
            if (
                (hasLineItems && (lineItemsByType.gsm_gateway || []).length) ||
                (!hasLineItems && (safeBreakdown.gsm_gateways || []).length)
            ) {
                drawSectionTitle("GSM Gateways");
                doc.fillColor("#666").font(fontBold).fontSize(9);
                drawRow([
                    { text: "Gateway", x: 60, w: 220 },
                    { text: "Qty", x: 280, w: 40, align: "right" },
                    { text: "Unit", x: 320, w: 70, align: "right" },
                    { text: "Total", x: 390, w: 130, align: "right" },
                ]);
                doc.font(fontRegular).fillColor("#555").fontSize(9);
                const rows = hasLineItems
                    ? lineItemsByType.gsm_gateway || []
                    : safeBreakdown.gsm_gateways;
                for (const row of rows) {
                    drawRow([
                        {
                            text: hasLineItems
                                ? ensureString(row?.description || "-")
                                : row?.gateway_name || `#${row?.gateway_id || "-"}`,
                            x: 60,
                            w: 220,
                        },
                        {
                            text: ensureString(
                                hasLineItems ? row?.quantity ?? "-" : row?.allocated_quantity ?? "-"
                            ),
                            x: 280,
                            w: 40,
                            align: "right",
                        },
                        {
                            text: formatMoney(hasLineItems ? row?.unit_price || 0 : row?.price_per_unit || 0),
                            x: 320,
                            w: 70,
                            align: "right",
                        },
                        {
                            text: formatMoney(hasLineItems ? row?.amount || 0 : row?.total_price || 0),
                            x: 390,
                            w: 130,
                            align: "right",
                        },
                    ]);
                }
                ensureSpace(18);
                doc
                    .font(fontBold)
                    .fillColor(textDark)
                    .text(
                        `GSM Gateways Subtotal: ${formatMoney(
                            hasLineItems
                                ? (lineItemsByType.gsm_gateway || []).reduce(
                                    (s, r) => s + Number(r?.amount || 0),
                                    0
                                )
                                : sectionTotals.gsm_gateways
                        )}`,
                        60,
                        y,
                        { align: "right", width: 460 }
                    );
                y += 22;
                doc.font(fontRegular).fillColor("#555");
            }

            // Servers
            if (
                (hasLineItems && (lineItemsByType.server || []).length) ||
                (!hasLineItems && (safeBreakdown.servers || []).length)
            ) {
                drawSectionTitle("Servers");
                doc.fillColor("#666").font(fontBold).fontSize(9);
                drawRow([
                    { text: "Server", x: 60, w: 220 },
                    { text: "Qty", x: 280, w: 40, align: "right" },
                    { text: "Unit", x: 320, w: 70, align: "right" },
                    { text: "Total", x: 390, w: 130, align: "right" },
                ]);
                doc.font(fontRegular).fillColor("#555").fontSize(9);
                const rows = hasLineItems ? lineItemsByType.server || [] : safeBreakdown.servers;
                for (const row of rows) {
                    drawRow([
                        {
                            text: hasLineItems
                                ? ensureString(row?.description || "-")
                                : row?.server_name || `#${row?.server_id || "-"}`,
                            x: 60,
                            w: 220,
                        },
                        {
                            text: ensureString(
                                hasLineItems ? row?.quantity ?? "-" : row?.allocated_quantity ?? "-"
                            ),
                            x: 280,
                            w: 40,
                            align: "right",
                        },
                        {
                            text: formatMoney(hasLineItems ? row?.unit_price || 0 : row?.price_per_unit || 0),
                            x: 320,
                            w: 70,
                            align: "right",
                        },
                        {
                            text: formatMoney(hasLineItems ? row?.amount || 0 : row?.total_price || 0),
                            x: 390,
                            w: 130,
                            align: "right",
                        },
                    ]);
                }
                ensureSpace(18);
                doc
                    .font(fontBold)
                    .fillColor(textDark)
                    .text(
                        `Servers Subtotal: ${formatMoney(
                            hasLineItems
                                ? (lineItemsByType.server || []).reduce(
                                    (s, r) => s + Number(r?.amount || 0),
                                    0
                                )
                                : sectionTotals.servers
                        )}`,
                        60,
                        y,
                        {
                            align: "right",
                            width: 460,
                        }
                    );
                y += 22;
                doc.font(fontRegular).fillColor("#555");
            }

            // Adjustments (proration or generic)
            if (hasLineItems) {
                const adjustments = (safeLineItems || []).filter(
                    (li) =>
                        li?.item_type === "adjustment" ||
                        li?.proration_start ||
                        li?.proration_end
                );
                if (adjustments.length) {
                    drawSectionTitle("Adjustments");
                    doc.fillColor("#666").font(fontBold).fontSize(9);
                    drawRow([
                        { text: "Description", x: 60, w: 330 },
                        { text: "Amount", x: 390, w: 130, align: "right" },
                    ]);
                    doc.font(fontRegular).fillColor("#555").fontSize(9);
                    for (const row of adjustments) {
                        drawRow([
                            { text: ensureString(row?.description || "-"), x: 60, w: 330 },
                            { text: formatMoney(row?.amount || 0), x: 390, w: 130, align: "right" },
                        ]);
                    }
                }
            }

            // Totals
            drawSectionTitle("Totals");
            drawRow([
                { text: "Rent Subtotal", x: 60, w: 330 },
                { text: formatMoney(sectionTotals.rent), x: 390, w: 130, align: "right" },
            ]);
            drawRow([
                { text: "Carried Forward (Previous Due)", x: 60, w: 330 },
                {
                    text: formatMoney(invoice.carried_forward_amount || 0),
                    x: 390,
                    w: 130,
                    align: "right",
                },
            ]);

            ensureSpace(28);
            doc
                .font(fontBold)
                .fillColor(textDark)
                .fontSize(11)
                .text(`Total Amount Due: ${formatMoney(invoice.total_amount || 0)}`, 60, y + 4, {
                    align: "right",
                    width: 460,
                });

            // Footer
            doc.rect(0, 750, 595, 80).fill("#0d1b3d");
            doc
                .fillColor("#fff")
                .fontSize(8)
                .text(
                    "This is a computer-generated invoice and does not require a signature.",
                    0,
                    770,
                    { align: "center" }
                );
            doc
                .fontSize(9)
                .text("Thank you for choosing our services.", 0, 790, { align: "center" });

            doc.end();

            stream.on("finish", () => {
                resolve(`/uploads/invoices/${fileName}`);
            });
        } catch (err) {
            reject(err);
        }
    });
};
