const mongoose = require("mongoose");
const BASIC_URL = process.env.BASIC_URL;

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    photoUrl: {
      type: String,
      default: `${BASIC_URL}/public/person.png`,
    },
    followings: [
      {
        type: mongoose.Schema.Types.ObjectId,
      },
    ],
    followers: [
      {
        type: mongoose.Schema.Types.ObjectId,
      },
    ],
    bookmarks: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Post",
      },
    ],
    postCount: {
      type: Number,
      default: 0,
    },
  },
  { versionKey: false }
);

const User = mongoose.model("User", userSchema);

module.exports = {
  User,
};
