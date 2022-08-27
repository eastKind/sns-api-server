const express = require("express");
const { isValidObjectId } = require("mongoose");
const bcrypt = require("bcrypt");
const { User } = require("../models");
const upload = require("../middleware/upload");
const s3 = require("../aws");

const router = express.Router();

// get me
router.get("/me", async (req, res) => {
  try {
    if (!req.sessionId) return res.status(401).send("세션이 만료되었습니다.");
    const user = await User.findById(req.userId).select(
      "-password -posts -email"
    );
    res.send({ user });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// get user
router.get("/:id", async (req, res) => {
  try {
    if (!req.sessionId) return res.status(401).send("세션이 만료되었습니다.");
    const { id } = req.params;
    if (isValidObjectId(id)) {
      const user = await User.findById(id).select(
        "-password -posts -email -bookmarks"
      );
      return res.send({ user });
    }
    res.status(404).send("존재하지 않는 사용자입니다.");
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// get followers
router.get("/followers/:id", async (req, res) => {
  try {
    if (!req.sessionId) return res.status(401).send("세션이 만료되었습니다.");
    const { id } = req.params;
    const { cursor, limit } = req.query;
    const user = await User.findById(id).populate({
      path: "followers",
      select: "id name photoUrl",
      match: cursor ? { _id: { $lt: cursor } } : {},
      options: {
        sort: { _id: -1 },
        limit,
      },
    });
    const hasNext = user.followers.length === Number(limit);
    res.send({ users: user.followers, hasNext });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// get followings
router.get("/followings/:id", async (req, res) => {
  try {
    if (!req.sessionId) return res.status(401).send("세션이 만료되었습니다.");
    const { id } = req.params;
    const { cursor, limit } = req.query;
    const user = await User.findById(id).populate({
      path: "followings",
      select: "id name photoUrl",
      match: cursor ? { _id: { $lt: cursor } } : {},
      options: {
        sort: { _id: -1 },
        limit,
      },
    });
    const hasNext = user.followings.length === Number(limit);
    res.send({ users: user.followings, hasNext });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// sign up
router.post("/", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const hash = await bcrypt.hash(password, 10);
    await User.create({ name, email, password: hash });
    res.send();
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// change photo
router.patch("/photo", upload.single("photo"), async (req, res) => {
  try {
    if (!req.sessionId) return res.status(401).send("세션이 만료되었습니다.");
    if (req.body.key !== "default_photo.png") {
      await s3
        .deleteObject({ Bucket: process.env.BUCKET, Key: req.body.key })
        .promise();
    }
    const user = await User.findByIdAndUpdate(
      req.userId,
      { photoUrl: req.file.location },
      {
        new: true,
      }
    );
    res.send({ photoUrl: user.photoUrl });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// change name
router.patch("/name", async (req, res) => {
  try {
    if (!req.sessionId) return res.status(401).send("세션이 만료되었습니다.");
    const { name } = req.body;
    const isExist = await User.findOne({ name });
    if (!isExist) {
      const user = await User.findByIdAndUpdate(
        req.userId,
        { name },
        { new: true }
      );
      res.send({ name: user.name });
    } else {
      res.status(400).send("이미 존재하는 이름입니다.");
    }
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// change desc
router.patch("/desc", async (req, res) => {
  try {
    if (!req.sessionId) return res.status(401).send("세션이 만료되었습니다.");
    const { desc } = req.body;
    const user = await User.findByIdAndUpdate(
      req.userId,
      { desc },
      { new: true }
    );
    res.send({ desc: user.desc });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// change password
router.patch("/password", async (req, res) => {
  try {
    if (!req.sessionId) return res.status(401).send("세션이 만료되었습니다.");
    const { current, next } = req.body;
    let user = await User.findById(req.userId);
    const match = await bcrypt.compare(current, user.password);
    if (match) {
      user.password = await bcrypt.hash(next, 10);
      user = await user.save();
      res.send();
    } else {
      res.status(400).send("비밀번호가 일치하지 않습니다.");
    }
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// follow
router.patch("/follow", async (req, res) => {
  try {
    if (!req.sessionId) return res.status(401).send("세션이 만료되었습니다.");
    const { userId: targetId, isFollowed } = req.body;
    const query = isFollowed ? "$pull" : "$push";
    await User.findByIdAndUpdate(targetId, {
      [query]: { followers: req.userId },
    });
    await User.findByIdAndUpdate(req.userId, {
      [query]: { followings: targetId },
    });
    res.send();
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// bookmark
router.patch("/bookmark", async (req, res) => {
  try {
    if (!req.sessionId) return res.status(401).send("세션이 만료되었습니다.");
    const { postId, isMarked } = req.body;
    const query = isMarked ? "$pull" : "$push";
    await User.findByIdAndUpdate(req.userId, {
      [query]: { bookmarks: postId },
    });
    res.send();
  } catch (error) {
    res.status(500).send(error.message);
  }
});

//validate
router.post("/validate", async (req, res) => {
  try {
    const { name, email } = req.body;
    const filter = {};
    if (name) filter.name = name;
    if (email) filter.email = email;
    const user = await User.findOne(filter);
    const caution = user ? `중복된 ${name ? "이름" : "이메일"}입니다.` : "";
    res.send({ caution });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

module.exports = router;
