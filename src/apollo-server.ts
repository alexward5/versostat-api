import { ApolloServer } from "@apollo/server";
import typeDefs from "./graphql/typeDefs";
import resolvers from "./graphql/resolvers";
import { createPlayerGameweekDataLoader, type GraphQLContext } from "./dataloaders";

const createServer = () => {
    return new ApolloServer<GraphQLContext>({
        typeDefs,
        resolvers,
    });
};

export default createServer;
