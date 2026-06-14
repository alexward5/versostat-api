import DataLoader from "dataloader";
import pool, { SCHEMA } from "./pg";
import type PlayerGameweekStats from "./types/PlayerGameweekStats";
import type PlayerStats from "./types/PlayerStats";

// Batches player gameweek stats by fpl_player_id in a single query per request
export function createPlayerGameweekStatsDataLoader() {
    return new DataLoader<string, PlayerGameweekStats[]>(
        async (playerIds: readonly string[]) => {
            if (playerIds.length === 0) return playerIds.map(() => []);

            const { rows } = await pool.query(
                `
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
                `,
                [playerIds as string[]],
            );

            const byPlayerId = new Map<string, PlayerGameweekStats[]>();
            for (const id of playerIds) {
                byPlayerId.set(id, []);
            }
            for (const row of rows as (PlayerGameweekStats & {
                fpl_player_id: string;
            })[]) {
                const { fpl_player_id, ...rest } = row;
                byPlayerId.get(fpl_player_id)!.push(rest as PlayerGameweekStats);
            }

            return playerIds.map((id) => byPlayerId.get(id)!);
        },
    );
}

// Batches player stats aggregations using a composite key "playerId:gwStart:gwEnd".
// All keys in a single batch share the same gwStart:gwEnd, so one SQL query is fired.
export function createPlayerStatsDataLoader() {
    return new DataLoader<string, PlayerStats>(
        async (compositeKeys: readonly string[]) => {
            if (compositeKeys.length === 0)
                return compositeKeys.map(() => ({
                    games_played: 0,
                    sum_minutes: 0,
                    sum_points: 0,
                    sum_goals: 0,
                    sum_assists: 0,
                    sum_bps: 0,
                    sum_cleansheets: 0,
                    sum_defensive_contributions: 0,
                    sum_xg: 0,
                    sum_xa: 0,
                    sum_xgi: 0,
                    sum_shots_on_target: 0,
                    sum_big_chances_created: 0,
                    sum_key_passes: 0,
                    sum_xgap: 0,
                }));

            const [firstKey] = compositeKeys;
            const [, gwStartStr, gwEndStr] = firstKey.split(":");
            const gwStart = parseInt(gwStartStr, 10);
            const gwEnd = parseInt(gwEndStr, 10);
            const playerIds = compositeKeys.map((k) => k.split(":")[0]);

            const { rows } = await pool.query(
                `
                    SELECT p.fpl_player_id,
                        COUNT(CASE WHEN pg.fpl_minutes > 0 THEN 1 END)::int AS games_played,
                        COALESCE(SUM(pg.fpl_minutes), 0)::int AS sum_minutes,
                        COALESCE(SUM(pg.fpl_total_points), 0)::int AS sum_points,
                        COALESCE(SUM(pg.fpl_goals_scored), 0)::int AS sum_goals,
                        COALESCE(SUM(pg.fpl_assists), 0)::int AS sum_assists,
                        COALESCE(SUM(pg.fpl_bps), 0)::int AS sum_bps,
                        COALESCE(SUM(pg.fpl_clean_sheet), 0)::int AS sum_cleansheets,
                        COALESCE(SUM(pg.fpl_defensive_contribution), 0)::int AS sum_defensive_contributions,
                        COALESCE(SUM(pg.fpl_expected_goals), 0)::float AS sum_xg,
                        COALESCE(SUM(pg.fpl_expected_assists), 0)::float AS sum_xa,
                        COALESCE(SUM(pg.fpl_xgi), 0)::float AS sum_xgi,
                        COALESCE(SUM(pg.sm_shots_on_target), 0)::int AS sum_shots_on_target,
                        COALESCE(SUM(pg.sm_big_chances_created), 0)::int AS sum_big_chances_created,
                        COALESCE(SUM(pg.sm_key_passes), 0)::int AS sum_key_passes,
                        COALESCE(SUM(pg.calc_xgap), 0)::float AS sum_xgap
                    FROM "${SCHEMA}".mv_player p
                    LEFT JOIN "${SCHEMA}".mv_player_gameweek pg
                        ON p.fpl_player_id = pg.fpl_player_id
                        AND pg.fpl_round >= $2
                        AND pg.fpl_round <= $3
                    WHERE p.fpl_player_id = ANY($1::text[])
                    GROUP BY p.fpl_player_id
                `,
                [playerIds, gwStart, gwEnd],
            );

            const byPlayerId = new Map<string, PlayerStats>();
            for (const row of rows as (PlayerStats & {
                fpl_player_id: string;
            })[]) {
                const { fpl_player_id, ...stats } = row;
                byPlayerId.set(fpl_player_id, stats as PlayerStats);
            }

            const empty: PlayerStats = {
                games_played: 0,
                sum_minutes: 0,
                sum_points: 0,
                sum_goals: 0,
                sum_assists: 0,
                sum_bps: 0,
                sum_cleansheets: 0,
                sum_defensive_contributions: 0,
                sum_xg: 0,
                sum_xa: 0,
                sum_xgi: 0,
                sum_shots_on_target: 0,
                sum_big_chances_created: 0,
                sum_key_passes: 0,
                sum_xgap: 0,
            };

            return compositeKeys.map((key) => {
                const playerId = key.split(":")[0];
                return byPlayerId.get(playerId) ?? empty;
            });
        },
    );
}

export interface GraphQLContext {
    playerGameweekStatsDataLoader: ReturnType<typeof createPlayerGameweekStatsDataLoader>;
    playerStatsDataLoader: ReturnType<typeof createPlayerStatsDataLoader>;
}
