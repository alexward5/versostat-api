import pool from "../pg";
import type Player from "../types/Player";
import type Team from "../types/Team";

const SCHEMA = "test_schema_2025";

const resolvers = {
    Query: {
        players: async () => {
            const query = `
                SELECT * FROM "${SCHEMA}".mv_player_data
            `;

            const { rows } = await pool.query(query);

            return rows;
        },
        teams: async () => {
            const query = `
                SELECT * FROM "${SCHEMA}".mv_team_matchlog
            `;

            const { rows } = await pool.query(query);

            // Create a Map to organize teams by their fbref_team identifier
            const teamMap = new Map<string, Team>();

            rows.forEach((row) => {
                // If the team is not already in the map, add it
                if (!teamMap.has(row.fbref_team)) {
                    teamMap.set(row.fbref_team, {
                        fbref_team: row.fbref_team,
                        fbref_team_matchlog: [],
                    });
                }

                // Retrieve the team from the map and add the matchlog fields
                const team = teamMap.get(row.fbref_team)!;
                team.fbref_team_matchlog.push({
                    fbref_match_date: row.fbref_date,
                    fbref_round: row.fbref_round,
                });
            });

            teamMap.forEach((team) => {
                // Sort match logs by match date
                team.fbref_team_matchlog.sort(
                    (a, b) =>
                        new Date(a.fbref_match_date).getTime() -
                        new Date(b.fbref_match_date).getTime()
                );

                // Assign a match number based on the sorted order
                team.fbref_team_matchlog.forEach((matchlog, index) => {
                    matchlog.match_number = index + 1;
                });
            });

            return Array.from(teamMap.values());
        },
        events: async () => {
            const query = `
                SELECT * FROM "${SCHEMA}".fpl_events
            `;

            const { rows } = await pool.query(query);

            return rows;
        },
    },
    Player: {
        player_gameweek_data: async (parent: Player) => {
            const query = `
                SELECT *
                FROM "${SCHEMA}".mv_player_matchlog
                WHERE fpl_player_id = '${parent.fpl_player_id}'
                ORDER BY fpl_gameweek ASC
            `;

            const { rows } = await pool.query(query);

            return rows;
        },
    },
};

export default resolvers;
