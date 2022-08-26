const express = require("express");
const { Post, User } = require("../models");
const getHasNext = require("../utils/getHasNext.js");
const upload = require("../middleware/upload.js");
const s3 = require("../aws.js");

const router = express.Router();
const Bucket = process.env.BUCKET;

router.get("/", async (req, res) => {
  try {
    if (!req.sessionId) throw new Error("세션이 만료됐습니다.");
    const { cursor, limit } = req.query;
    const filter = cursor ? { _id: { $lt: cursor } } : {};
    const posts = await Post.find(filter)
      .populate({ path: "writer", select: "id name photoUrl" })
      .select("-comments")
      .sort({ _id: -1 })
      .limit(limit);
    const hasNext = await getHasNext(Post, filter, limit);
    res.send({ posts, hasNext });
  } catch (error) {
    res.status(400).send(error.message);
  }
});

router.get("/bookmark", async (req, res) => {
  try {
    if (!req.sessionId) throw new Error("세션이 만료됐습니다.");
    const { cursor, limit } = req.query;
    const user = await User.findById(req.userId).populate({
      path: "bookmarks",
      select: "-comments",
      populate: { path: "writer", select: "id name photoUrl" },
      match: cursor ? { _id: { $lt: cursor } } : {},
      options: {
        sort: { _id: -1 },
        limit,
      },
    });
    const hasNext = user.bookmarks.length === Number(limit);
    res.send({ posts: user.bookmarks, hasNext });
  } catch (error) {
    res.status(400).send(error.message);
  }
});

router.get("/:id", async (req, res) => {
  try {
    if (!req.sessionId) throw new Error("세션이 만료됐습니다.");
    const { id } = req.params;
    const { cursor, limit } = req.query;
    const user = await User.findById(id).populate({
      path: "posts",
      select: "-comments",
      populate: { path: "writer", select: "id name photoUrl" },
      match: cursor ? { _id: { $lt: cursor } } : {},
      options: {
        sort: { _id: -1 },
        limit,
      },
    });
    const hasNext = user.posts.length === Number(limit);
    res.send({ posts: user.posts, hasNext });
  } catch (error) {
    res.status(400).send(error.message);
  }
});

router.post("/", upload.array("image"), async (req, res) => {
  try {
    if (!req.sessionId) throw new Error("세션이 만료됐습니다.");
    const { ratio, texts } = req.body;
    const images = req.files.map((file) => ({
      url: file.location,
      key: file.key,
    }));
    const post = await Post.create({
      texts,
      images,
      ratio,
      writer: req.userId,
    });
    await Post.populate(post, { path: "writer", select: "id name photoUrl" });
    await User.findByIdAndUpdate(req.userId, {
      $inc: { postCount: 1 },
      $push: { posts: post._id },
    });
    res.send({ post });
  } catch (error) {
    res.status(400).send(error.message);
  }
});

router.delete("/:id", async (req, res) => {
  try {
    if (!req.sessionId) throw new Error("세션이 만료됐습니다.");
    const { id } = req.params;
    const post = await Post.findByIdAndRemove(id);
    await Promise.all(
      post.images.map((image) => {
        return s3.deleteObject({ Bucket, Key: image.key }).promise();
      })
    );
    await User.findByIdAndUpdate(req.userId, {
      $inc: { postCount: -1 },
      $pull: { posts: id },
    });
    res.send({ id });
  } catch (error) {
    res.status(400).send(error.message);
  }
});

router.patch("/:id", async (req, res) => {
  try {
    if (!req.sessionId) throw new Error("세션이 만료됐습니다.");
    const { id } = req.params;
    const { texts, deletedKeys } = req.body;
    let post = await Post.findById(id);
    post.texts = texts;

    if (deletedKeys.length > 0) {
      await Promise.all(
        deletedKeys.map((deletedKey) =>
          s3.deleteObject({ Bucket, Key: deletedKey }).promise()
        )
      );
      deletedKeys.forEach((deletedKey) => {
        post.images = post.images.filter((image) => image.key !== deletedKey);
      });
    }
    post = await (
      await post.save()
    ).populate({ path: "writer", select: "id name photoUrl" });
    res.send({ post });
  } catch (error) {
    res.status(400).send(error.message);
  }
});

router.patch("/:id/like", async (req, res) => {
  try {
    if (!req.sessionId) throw new Error("세션이 만료됐습니다.");
    const { id } = req.params;
    const { isLiked } = req.body;
    const post = await Post.findByIdAndUpdate(
      id,
      {
        [isLiked ? "$pull" : "$push"]: { likeUsers: req.userId },
      },
      { new: true }
    );
    res.send({ likeUsers: post.likeUsers });
  } catch (error) {
    res.status(400).send(error.message);
  }
});

module.exports = router;
