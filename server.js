import express from 'express';
import routes from './routes/index.js'; // We'll create this next

const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());

// Mount the routes
app.use('/', routes);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
