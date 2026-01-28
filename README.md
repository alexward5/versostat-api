# FPL Edge API

This API serves as the backend for the [FPL Edge Frontend](https://github.com/alexward5/fpl-edge-frontend). In order to run this API you will first need to configure a database with the required schemas and tables, and you will need to seed the database with data. Both of these database setup steps are done using the [FPL Edge Scraper](https://github.com/alexward5/fpl-edge-scraper). The setup instructions for the scraper can be found in the README for that repository.

## Setup Instructions

Once you've run the FPL Edge Scraper against your database, create a .env file in the root directory with the following values (Note: this .env file will should match the .env file for the scraper):

```
  dbhost=[YOUR_DB_HOST]
  dbport=[YOUR_DB_PORT]
  database=[YOUR_DB_NAME]
  dbuser=[YOUR_DB_USER]
  dbpassword=[YOUR_DB_PASSWORD]
```

Once you have a .env created with the necessary information for your database, open a terminal and install the required packages with `npm install`.

## Running the API in development mode

In order to run the API locally run `npm run dev` from your terminal. This will allow you to run the API and make changes while only recompiling the files that you made changes to.

## Building and running for deployment

Run `npm start` from the terminal. This will transpile the TypeScript code to the .`/dist` directory and start the API from the `./dist/src/index.js` file.
