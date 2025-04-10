import { v4 as uuidv4 } from 'uuid';
import { promises as fs } from 'fs';
import path from 'path';
import { ObjectId } from 'mongodb';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

const FOLDER_PATH = process.env.FOLDER_PATH || '/tmp/files_manager';

class FilesController {
  static async postUpload(req, res) {
    const token = req.headers['x-token'];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const user = await dbClient.db.collection('users').findOne({ _id: new ObjectId(userId) });
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const {
      name,
      type,
      parentId = 0,
      isPublic = false,
      data,
    } = req.body;

    // Validations
    if (!name) return res.status(400).json({ error: 'Missing name' });
    if (!type || !['folder', 'file', 'image'].includes(type)) {
      return res.status(400).json({ error: 'Missing type' });
    }
    if (type !== 'folder' && !data) {
      return res.status(400).json({ error: 'Missing data' });
    }

    let parentObjectId = parentId;
    if (parentId !== 0) {
      try {
        parentObjectId = new ObjectId(parentId);
      } catch (e) {
        return res.status(400).json({ error: 'Parent not found' });
      }

      const parent = await dbClient.db.collection('files').findOne({ _id: parentObjectId });
      if (!parent) return res.status(400).json({ error: 'Parent not found' });
      if (parent.type !== 'folder') return res.status(400).json({ error: 'Parent is not a folder' });
    }

    const fileData = {
      userId: user._id,
      name,
      type,
      isPublic,
      parentId: parentId === 0 ? 0 : parentObjectId,
    };

    if (type === 'folder') {
      const result = await dbClient.db.collection('files').insertOne(fileData);
      return res.status(201).json({
        id: result.insertedId.toString(),
        userId: user._id.toString(),
        name,
        type,
        isPublic,
        parentId,
      });
    }

    // File or image
    await fs.mkdir(FOLDER_PATH, { recursive: true });

    const filename = uuidv4();
    const localPath = path.join(FOLDER_PATH, filename);
    await fs.writeFile(localPath, Buffer.from(data, 'base64'));

    fileData.localPath = localPath;

    const result = await dbClient.db.collection('files').insertOne(fileData);

    return res.status(201).json({
      id: result.insertedId.toString(),
      userId: user._id.toString(),
      name,
      type,
      isPublic,
      parentId,
    });
  }

  static async getShow(req, res) {
    const token = req.headers['x-token'];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    let fileId;
    try {
      fileId = new ObjectId(req.params.id);
    } catch (err) {
      return res.status(404).json({ error: 'Not found' });
    }

    const file = await dbClient.db.collection('files').findOne({
      _id: fileId,
      userId: new ObjectId(userId),
    });

    if (!file) return res.status(404).json({ error: 'Not found' });

    return res.status(200).json({
      id: file._id.toString(),
      userId: file.userId.toString(),
      name: file.name,
      type: file.type,
      isPublic: file.isPublic,
      parentId: file.parentId === 0 ? 0 : file.parentId.toString(),
    });
  }

  static async getIndex(req, res) {
    const token = req.headers['x-token'];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Use default values
    const parentId = req.query.parentId || '0';
    const pageParam = parseInt(req.query.page, 10);
    const page = Number.isNaN(pageParam) || pageParam < 0 ? 0 : pageParam;

    let filter;
    if (parentId === '0') {
      filter = {
        userId: new ObjectId(userId),
        parentId: 0,
      };
    } else {
      try {
        filter = {
          userId: new ObjectId(userId),
          parentId: new ObjectId(parentId),
        };
      } catch (err) {
        // If parentId is invalid format, return empty list
        return res.status(200).json([]);
      }
    }

    try {
        console.log('Fetching files for user:', userId, 'page:', page);

        const files = await dbClient.db
          .collection('files')
          .aggregate([
            { $match: filter },
            { $skip: page * 20 },
            { $limit: 20 },
          ])
          .toArray();

        console.log('Files fetched:', files.length);

      const result = files.map((file) => ({
        id: file._id.toString(),
        userId: file.userId.toString(),
        name: file.name,
        type: file.type,
        isPublic: file.isPublic,
        parentId: file.parentId === 0 ? 0 : file.parentId.toString(),
      }));

      return res.status(200).json(result);
    } catch (err) {
      console.error('Error in GET /files:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
}

export default FilesController;
