import pool from "../pg";
import type Player from "../types/Player";
import type PlayerGameweekData from "../types/PlayerGameweekData";

const SCHEMA = "my_schema";

const PLAYERS_WITH_GAMEWEEK_QUERY = `
    SELECT
        p.fpl_player_id,
        p.fpl_web_name,
        p.fpl_team_name,
        p.fpl_player_position,
        p.fpl_player_cost,
        p.fpl_selected_by_percent,
        COALESCE(
            json_agg(
                json_build_object(
                    'fpl_minutes', gw.fpl_minutes,
                    'fpl_round', gw.fpl_round,
                    'fpl_total_points', gw.fpl_total_points,
                    'fpl_goals_scored', gw.fpl_goals_scored,
                    'fpl_assists', gw.fpl_assists,
                    'fpl_bps', gw.fpl_bps,
                    'fpl_clean_sheet', gw.fpl_clean_sheet,
                    'fpl_defensive_contribution', gw.fpl_defensive_contribution,
                    'fpl_expected_goals', gw.fpl_expected_goals,
                    'fpl_expected_assists', gw.fpl_expected_assists,
                    'fpl_xgi', gw.fpl_xgi,
                    'sm_shots_on_target', gw.sm_shots_on_target,
                    'sm_big_chances_created', gw.sm_big_chances_created,
                    'sm_key_passes', gw.sm_key_passes,
                    'calc_xgap', gw.calc_xgap
                ) ORDER BY gw.fpl_round ASC
            ) FILTER (WHERE gw.fpl_player_id IS NOT NULL),
            '[]'::json
        ) AS player_gameweek_data
    FROM "${SCHEMA}".mv_player p
    LEFT JOIN "${SCHEMA}".mv_player_gameweek gw ON p.fpl_player_id = gw.fpl_player_id
    GROUP BY p.fpl_player_id, p.fpl_web_name, p.fpl_team_name,
        p.fpl_player_position, p.fpl_player_cost, p.fpl_selected_by_percent
`;

function parseGameweekData(raw: unknown): PlayerGameweekData[] {
    if (Array.isArray(raw)) return raw as PlayerGameweekData[];
    if (raw == null) return [];
    const json = typeof raw === "string" ? raw : JSON.stringify(raw);
    return JSON.parse(json) as PlayerGameweekData[];
}

function mapRowToPlayer(row: Record<string, unknown>): Player {
    return {
        fpl_player_id: row.fpl_player_id,
        fpl_web_name: row.fpl_web_name,
        fpl_team_name: row.fpl_team_name,
        fpl_player_position: row.fpl_player_position,
        fpl_player_cost: row.fpl_player_cost,
        fpl_selected_by_percent: row.fpl_selected_by_percent,
        player_gameweek_data: parseGameweekData(row.player_gameweek_data),
    } as Player;
}

const resolvers = {
    Query: {
        players: async (): Promise<Player[]> => {
            const { rows } = await pool.query(PLAYERS_WITH_GAMEWEEK_QUERY);
            return (rows as Record<string, unknown>[]).map(mapRowToPlayer);
        },
        teams: async () => {
            const { rows } = await pool.query(`
                SELECT name FROM "${SCHEMA}".fpl_teams
            `);
            return rows;
        },
        events: async () => {
            const { rows } = await pool.query(`
                SELECT id, is_current, finished FROM "${SCHEMA}".fpl_events
            `);
            return rows;
        },
    },
    Player: {
        // Data is pre-loaded in players query
        player_gameweek_data: (parent: Player) => parent.player_gameweek_data,
    },
};

export default resolvers;
