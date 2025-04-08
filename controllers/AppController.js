import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class AppController {
  // GET /status returns { "redis": true, "db": true } if both are alive
  static async getStatus(req, res) {
    res.status(200).json({
      redis: redisClient.isAlive(),
      db: dbClient.isAlive(),
    });
  }

  // GET /stats returns the number of documents in the 'users' and 'files' collections
  static async getStats(req, res) {
    try {
      const users = await dbClient.nbUsers();
      const files = await dbClient.nbFiles();
      res.status(200).json({
        users,
        files,
      });
    } catch (error) {
      res.status(500).json({ error: 'Error retrieving stats' });
    }
  }
}

export default AppController;
