const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const session = require("express-session");
const cookieParser = require("cookie-parser");

const server = express();
const port = 3000;

server.use(cookieParser());

server.set("trust proxy", 1);

server.use(bodyParser.json())
server.use(bodyParser.urlencoded({ extended: false }));

server.use(session({
  secret: "fhfjdjdj",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 30 }
}))

const postSchema = new mongoose.Schema({
  title: String,
  text: String,
  user: String,
  date: Date
});

const Post = mongoose.model("Posts", postSchema);

const userSchema = new mongoose.Schema({
  username: String,
  password: String,
});

const User = mongoose.model("Users", userSchema);

main().catch(err => console.log(err));

async function main() {
  await mongoose.connect("mongodb://127.0.0.1:27017/blog");
}

// Statiska html sidor
server.get("/", async (request, response) => {

  if (request.session.isLoggedIn === true) {
    response.redirect("/loggedin");
  } else {
    response.sendFile(path.join(__dirname, "public/index.html"))
  }
});

server.get("/login", async (request, response) => {
  response.sendFile(path.join(__dirname, "public/login.html"))
});

server.get("/loggedin", async (request, response) => {

  if (!request.session.isLoggedIn) {
    response.redirect("/")
  }

  response.sendFile(path.join(__dirname, "public/loggedin.html"))
});

server.get("/post", async (request, response) => {

  if (!request.session.isLoggedIn) {
    response.redirect("/")
  }

  response.sendFile(path.join(__dirname, "public/post.html"))
});

server.get("/skapaAnvandare", async (request, response) => {

  response.sendFile(path.join(__dirname, "public/skapaAnvandare.html"))
});

// get /users     hämtar användare

server.get("/api/users", async (request, response) => {
  if (!request.session.isLoggedIn) {
    response.redirect("/")
  }

  var kw = request.query.name;

  const users = await User.find();

  if (kw) {
    let filteredUsers = users.filter(p => p.name.indexOf(kw) > 0);
    response.send(filteredUsers)
  } else {
    response.send(users)
  }
});

// post /users    skapa ny användare

server.post("/api/users", (request, response) => {
  const body = request.body;

  // hasha och salta lösenordet

  const hashedPassword = bcrypt.hashSync(body.password, 10);

  const newUser = new User({ username: body.username, password: hashedPassword });
  newUser.save();

  response.redirect("/login")
});

// Logga in

server.post("/api/login", async (request, response) => {
  const body = request.body;
  let user;
  try {
    user = await User.findOne({ "username": body.username });
  } catch (error) {
    response.sendStatus(500); // Internal server error
    return;
  }
  if (!user) {
    response.sendStatus(404); // Not found
    return;
  }
  if (bcrypt.compareSync(body.password, user.password)) {
    request.session.isLoggedIn = true;
    request.session.username = user.username;
    response.redirect("/loggedin");
  } else {
    response.sendStatus(401); // Unauthorized
    return;
  }
});

server.get("/api/session", (request, response) => {
  if (!request.session.isLoggedIn) {
    response.sendStatus(403); // Forbidden
    return;
  }

  response.send(request.session.username);
});

// Logga ut

server.post("/api/logout", async (request, response) => {

  request.session.isLoggedIn = false;
  request.session.username = null;
  response.redirect("/");

});


// post /posts    skapa nytt blogginlägg

server.post("/api/posts", (request, response) => {
  if (!request.session.isLoggedIn) {
    response.sendStatus(403); // Forbidden
    return;
  }

  const body = request.body;

  const newPost = new Post({
    title: body.title,
    text: body.text,
    user: request.session.username,
    date: new Date()
  });
  newPost.save();

  response.redirect("/loggedin")
});

// Get posts

server.get("/api/posts", async (request, response) => {
  if (!request.session.isLoggedIn) {
    response.sendStatus(403); // Forbidden
    return;
  }

  const posts = await Post.find();

  const allPosts = posts.map((post) => {

    return {
      id: post._id,
      title: post.title,
      text: post.text,
      date: post.date,
      user: post.user,
      myPost: post.user === request.session.username

    }
  })

  response.send(allPosts)
});

// delete //users/:id  raderar en användare 

server.delete("/api/users/:id", async (request, response) => {
  if (!request.session.isLoggedIn) {
    response.sendStatus(403); // Forbidden
    return;
  }

  try {
    await User.findOneAndDelete({ _id: request.params.id });
  } catch (error) {
    response.sendStatus(404); // Not found
    return;
  }

  response.send();
});

// post //posts/:id  raderar ett blogginlägg

server.post("/api/posts/:id", async (request, response) => {
  if (!request.session.isLoggedIn) {
    response.sendStatus(403); // Forbidden
    return;
  }

  try {
    await Post.findOneAndDelete({ _id: request.params.id });
  } catch (error) {
    response.sendStatus(404); // Not found
    return;
  }

  response.redirect("/loggedin");
});

server.listen(port, () => {
  console.log("Server startad: http://localhost:" + port);
})