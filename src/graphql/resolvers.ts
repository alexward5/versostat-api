import pool, { SCHEMA } from "../pg";
import type Player from "../types/Player";
import type { GraphQLContext } from "../dataloaders";
import { createCache } from "../cache";

const playersCache = createCache<Player[]>();
const teamsCache = createCache<{ name: string }[]>();
const eventsCache = createCache<{ id: number; is_current: boolean; finished: boolean }[]>();

const resolvers = {
    Query: {
        players: async (): Promise<Player[]> => {
            const cached = playersCache.get();
            if (cached) return cached;
            const { rows } = await pool.query(`
                SELECT fpl_player_id,
                    fpl_web_name,
                    fpl_team_name,
                    fpl_player_position,
                    fpl_player_cost,
                    fpl_selected_by_percent
                FROM "${SCHEMA}".mv_player
            `);
            const result = rows as Player[];
            playersCache.set(result);
            return result;
        },
        teams: async () => {
            const cached = teamsCache.get();
            if (cached) return cached;
            const { rows } = await pool.query(`
                SELECT name FROM "${SCHEMA}".fpl_teams
            `);
            teamsCache.set(rows);
            return rows;
        },
        events: async () => {
            const cached = eventsCache.get();
            if (cached) return cached;
            const { rows } = await pool.query(`
                SELECT id, is_current, finished FROM "${SCHEMA}".fpl_events
            `);
            eventsCache.set(rows);
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
