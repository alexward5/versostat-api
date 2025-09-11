const typeDefs = `#graphql
    type PlayerGameweekData {
        fbref_round: Int!
        fbref_minutes: Int!
        fbref_npxg: Float!
        fbref_xg_assist: Float!
        calc_fpl_npxp: Float!
        fpl_gameweek: Int!
        fpl_total_points: Int!
        fpl_goals_scored: Int!
        fpl_assists: Int!
        fpl_bps: Int!
        fpl_clean_sheet: Int!
        fpl_defensive_contribution: Int!
    }

    type Player {
        fpl_player_id: String!
        fpl_player_code: Int!
        fpl_web_name: String!
        fbref_team: String!
        fpl_player_position: String!
        fpl_player_cost: Float!
        fpl_selected_by_percent: Float!
        player_gameweek_data(
            gameweekStart: Int
            gameweekEnd: Int
        ): [PlayerGameweekData!]!
    }

    type TeamMatchlog {
        fbref_match_date: String!
        fbref_round: Int!
        match_number: Int!
    }

    type Team {
        fbref_team: String!
        fbref_team_matchlog: [TeamMatchlog!]!
    }

    type Events {
        id: Int!
        finished: Boolean!
        is_current: Boolean!
    }

    type Query {
        players(ids: [String!]): [Player!]!
        teams(teamNames: [String!]): [Team!]!
        events: [Events!]!
    }
`;

export default typeDefs;
