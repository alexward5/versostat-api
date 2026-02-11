import pool from "../pg";
import type Player from "../types/Player";
import type { GraphQLContext } from "../dataloaders";

const SCHEMA = "my_schema";

const resolvers = {
    Query: {
        players: async (): Promise<Player[]> => {
            const { rows } = await pool.query(`
                SELECT fpl_player_id,
                    fpl_web_name,
                    fpl_team_name,
                    fpl_player_position,
                    fpl_player_cost,
                    fpl_selected_by_percent
                FROM "${SCHEMA}".mv_player
            `);
            return rows as Player[];
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
        player_gameweek_data: (
            parent: Player,
            _args: Record<string, never>,
            context: GraphQLContext
        ) => context.playerGameweekDataLoader.load(parent.fpl_player_id),
    },
};

export default resolvers;
