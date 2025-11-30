import DataLoader from "dataloader";
import pool from "./pg";
import type PlayerGameweekData from "./types/PlayerGameweekData";

const SCHEMA = "test_schema_2025";

// DataLoader for batching player gameweek data queries
// This solves the N+1 problem by batching multiple player_id queries into a single database query
export const createPlayerGameweekDataLoader = () => {
    return new DataLoader<string, PlayerGameweekData[]>(
        async (playerIds: readonly string[]) => {
            // Create a single query that fetches gameweek data for all requested players
            const query = `
            SELECT *
            FROM "${SCHEMA}".mv_player_matchlog
            WHERE fpl_player_id = ANY($1::text[])
            ORDER BY fpl_player_id, fpl_gameweek ASC
        `;

            const { rows } = await pool.query(query, [playerIds]);

            // Group results by player_id
            const resultsByPlayerId = new Map<string, PlayerGameweekData[]>();

            // Initialize empty arrays for all player IDs
            playerIds.forEach((playerId) => {
                resultsByPlayerId.set(playerId, []);
            });

            // Populate the map with actual results
            // Note: rows include fpl_player_id for grouping, but we return PlayerGameweekData[]
            rows.forEach((row: any) => {
                const playerId = row.fpl_player_id;
                const existing = resultsByPlayerId.get(playerId) || [];
                existing.push(row as PlayerGameweekData);
                resultsByPlayerId.set(playerId, existing);
            });

            // Return results in the same order as the input playerIds
            return playerIds.map(
                (playerId) => resultsByPlayerId.get(playerId) || []
            );
        }
    );
};

// Context type for GraphQL resolvers
// This ensures type safety when accessing DataLoaders in resolvers
export interface GraphQLContext {
    playerGameweekDataLoader: ReturnType<typeof createPlayerGameweekDataLoader>;
}
