import DataLoader from "dataloader";
import pool from "./pg";
import type PlayerGameweekData from "./types/PlayerGameweekData";

const SCHEMA = "my_schema";

// Batches player gameweek data by fpl_player_id to avoid N+1 when resolving player_gameweek_data
export const createPlayerGameweekDataLoader = () => {
    return new DataLoader<string, PlayerGameweekData[]>(
        async (playerIds: readonly string[]) => {
            if (playerIds.length === 0) return playerIds.map(() => []);

            const query = `
                SELECT fpl_player_id,
                    fpl_minutes,
                    fpl_round,
                    fpl_total_points,
                    fpl_goals_scored,
                    fpl_assists,
                    fpl_bps,
                    fpl_clean_sheet,
                    fpl_defensive_contribution,
                    fpl_expected_goals,
                    fpl_expected_assists,
                    fpl_xgi,
                    sm_shots_on_target,
                    sm_big_chances_created,
                    sm_key_passes,
                    calc_xgap
                FROM "${SCHEMA}".mv_player_gameweek
                WHERE fpl_player_id = ANY($1::text[])
                ORDER BY fpl_player_id, fpl_round ASC
            `;

            const { rows } = await pool.query(query, [playerIds]);

            const byPlayerId = new Map<string, PlayerGameweekData[]>();
            for (const id of playerIds) {
                byPlayerId.set(id, []);
            }
            for (const row of rows as (PlayerGameweekData & {
                fpl_player_id: string;
            })[]) {
                const { fpl_player_id, ...rest } = row;
                byPlayerId.get(fpl_player_id)!.push(rest as PlayerGameweekData);
            }

            return playerIds.map((id) => byPlayerId.get(id)!);
        },
    );
};

export interface GraphQLContext {
    playerGameweekDataLoader: ReturnType<typeof createPlayerGameweekDataLoader>;
}
