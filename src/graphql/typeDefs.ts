const typeDefs = `#graphql
    type PlayerGameweekData {
        fpl_minutes: Int!
        fpl_round: Int!
        fpl_total_points: Int!
        fpl_goals_scored: Int!
        fpl_assists: Int!
        fpl_bps: Int!
        fpl_clean_sheet: Int!
        fpl_defensive_contribution: Int!
        fpl_expected_goals: Float!
        fpl_expected_assists: Float!
        fpl_xgi: Float!
        sm_shots_on_target: Int!
        sm_big_chances_created: Int!
        sm_key_passes: Int!
        calc_xgap: Float!
    }

    type Player {
        fpl_player_id: String!
        fpl_web_name: String!
        fpl_team_name: String!
        fpl_player_position: String!
        fpl_player_cost: Float!
        fpl_selected_by_percent: Float!
        player_gameweek_data: [PlayerGameweekData!]!
    }

    type Team {
        name: String!
    }

    type Event {
        id: Int!
        is_current: Boolean!
        finished: Boolean!
    }

    type Query {
        players: [Player!]!
        teams: [Team!]!
        events: [Event!]!
    }
`;

export default typeDefs;
