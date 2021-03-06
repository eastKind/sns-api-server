const express = require("express");
const { Post } = require("../models");
const getHasNext = require("../utils/getHasNext.js");
const upload = require("../middleware/upload.js");
const s3 = require("../aws.js");

const router = express.Router();
const Bucket = process.env.BUCKET;

router.get("/", async (req, res) => {
  try {
    if (!req.sessionId) throw new Error("Invalid Session");
    const { cursor, limit } = req.query;
    const posts = await Post.find(cursor ? { _id: { $lt: cursor } } : {})
      .populate({ path: "writer", select: "id name photoUrl" })
      .sort({ _id: -1 })
      .limit(limit);
    const hasNext = await getHasNext(Post, cursor, limit);
    res.send({ posts, hasNext });
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    if (!req.sessionId) throw new Error("Invalid Session");
    const { id } = req.params;
    const post = await Post.findById(id).populate({
      path: "writer",
      select: "id name photoUrl",
    });
    res.send({ post });
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

router.post("/", upload.array("image"), async (req, res) => {
  try {
    if (!req.sessionId) throw new Error("Invalid Session");
    const { title, contents = "" } = req.body;
    const images = req.files.map((file) => ({
      url: file.location,
      key: file.key,
    }));
    const post = await Post.create({
      title,
      contents,
      images,
      writer: req.userId,
    });
    await Post.populate(post, { path: "writer", select: "id name photoUrl" });
    res.send({ post });
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    if (!req.sessionId) throw new Error("Invalid Session");
    const { id } = req.params;
    const post = await Post.findByIdAndRemove(id);
    await Promise.all(
      post.images.map((image) => {
        return s3.deleteObject({ Bucket, Key: image.key }).promise();
      })
    );
    res.send({ id });
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    if (!req.sessionId) throw new Error("Invalid Session");
    const { id } = req.params;
    const { title, contents, deletedKeys } = req.body;

    let post = await Post.findById(id);
    post.title = title;
    post.contents = contents;

    if (deletedKeys.length > 1) {
      await Promise.all(
        deletedKeys.map((deletedKey) =>
          s3.deleteObject({ Bucket, Key: deletedKey }).promise()
        )
      );
      deletedKeys.forEach((deletedKey) => {
        post.images = post.images.filter((image) => image.key !== deletedKey);
      });
    }
    post = await post.save();
    res.send({ post });
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

router.patch("/:id/like", async (req, res) => {
  try {
    if (!req.sessionId) throw new Error("Invalid Session");
    const { id } = req.params;
    const { isLike } = req.body;
    const post = await Post.findByIdAndUpdate(
      id,
      { $inc: { likeCount: isLike ? 1 : -1 } },
      { new: true }
    );
    res.send({ post });
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

module.exports = router;
