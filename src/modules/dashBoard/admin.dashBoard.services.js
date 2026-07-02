import * as DashboardModel from "./admin.dashBoard.model.js";
import { withTransaction } from "../../utils/withTransaction.js";

export const getDashboardAnalytics = async () => {
    return withTransaction(async (conn) => {

        // ── Run all queries in parallel ───────────────────────────────────
        const [
            totalClients,
            totalSystems,
            totalAssets,
            totalGateways,
            totalServers,
            systemAssignments,
            assetAssignments,
            gatewayAssignments,
            serverAssignments,
        ] = await Promise.all([
            DashboardModel.getActiveClientsCountTx(conn),
            DashboardModel.getAssignedSystemsCountTx(conn),
            DashboardModel.getAssignedAssetsCountTx(conn),
            DashboardModel.getAssignedGatewaysCountTx(conn),
            DashboardModel.getAssignedServersCountTx(conn),
            DashboardModel.getSystemAssignmentsTx(conn),
            DashboardModel.getAssetAssignmentsTx(conn),
            DashboardModel.getGatewayAssignmentsTx(conn),
            DashboardModel.getServerAssignmentsTx(conn),
        ]);

        // ── Shape response ────────────────────────────────────────────────
        return {
            summary: {
                total_active_clients:    totalClients,
                total_systems_assigned:  totalSystems,
                total_assets_assigned:   totalAssets,
                total_gateways_assigned: totalGateways,
                total_servers_assigned:  totalServers,
            },
            assignments: {
                systems: systemAssignments.map((r) => ({
                    system_id:    r.system_id,
                    system_uid:   r.system_uid,
                    system_name:  r.system_name,
                    system_price: Number(r.system_price),
                    agreement_id: r.agreement_id,
                    client_id:    r.client_id,
                    client_name:  r.client_name,
                })),
                assets: assetAssignments.map((r) => ({
                    asset_id:            r.asset_id,
                    asset_category_name: r.asset_category_name,
                    brand:               r.brand,
                    model:               r.model,
                    serial_number:       r.serial_number,
                    asset_price:         Number(r.asset_price),
                    agreement_id:        r.agreement_id,
                    client_id:           r.client_id,
                    client_name:         r.client_name,
                })),
                gateways: gatewayAssignments.map((r) => ({
                    gateway_id:         r.gateway_id,
                    gateway_name:       r.gateway_name,
                    model_number:       r.model_number,
                    allocated_quantity: Number(r.allocated_quantity),
                    price_per_unit:     Number(r.price_per_unit),
                    total_price:        Number(r.total_price),
                    agreement_id:       r.agreement_id,
                    client_id:          r.client_id,
                    client_name:        r.client_name,
                })),
                servers: serverAssignments.map((r) => ({
                    server_id:          r.server_id,
                    server_name:        r.server_name,
                    brand:              r.brand,
                    processor:          r.processor,
                    allocated_quantity: Number(r.allocated_quantity),
                    price_per_unit:     Number(r.price_per_unit),
                    total_price:        Number(r.total_price),
                    agreement_id:       r.agreement_id,
                    client_id:          r.client_id,
                    client_name:        r.client_name,
                })),
            },
        };
    });
};