const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const session = require("express-session");
const MongoDBStore = require('connect-mongodb-session')(session);
const cookieParser = require("cookie-parser");
const sanitizeHtml = require('sanitize-html');
const csrf = require('csurf');
const server = express();
const expressWs = require('express-ws')(server);

const port = 3000;

const mongoConnectionString = "mongodb://127.0.0.1:27017/blog";


server.use(cookieParser());

server.set("trust proxy", 1);

server.use(bodyParser.json())
server.use(bodyParser.urlencoded({ extended: false }));

server.use(cookieParser());

const ignoreMethods = [
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'DELETE',
  'OPTIONS'
]

const csrfInit = csrf({ ignoreMethods, cookie: true });
server.use(csrfInit);
const csrfProtection = csrf({ cookie: true });

//server.use(express.static("public"));

const mongoStore = new MongoDBStore({
  uri: mongoConnectionString,
  collection: 'mySessions'
});

server.use(session({
  secret: "maltes igelkott",
  resave: true,
  saveUninitialized: true,
  cookie: { maxAge: 1000 * 60 * 30 },
  store: mongoStore
}))

const postSchema = new mongoose.Schema({
  title: String,
  text: String,
  user: String,
  date: Date,
  comments: [{ user: String, text: String }],
  likes: [{ user: String }]
});

const Post = mongoose.model("Posts", postSchema);

const userSchema = new mongoose.Schema({
  username: String,
  password: String,
  admin: Boolean
});

const User = mongoose.model("Users", userSchema);

main().catch(err => console.log(err));

async function main() {
  await mongoose.connect(mongoConnectionString);
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
    return;
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

server.post("/api/users", async (request, response) => {
  const body = request.body;

  // hasha och salta lösenordet
  const hashedPassword = bcrypt.hashSync(body.password, 10);

  const users = await User.find();

  const admin = users.length === 0;

  const newUser = new User({ username: body.username, password: hashedPassword, admin: admin });
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
    request.session.admin = user.admin;

    response.redirect("/loggedin");
    return;
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

  response.send({
    username: request.session.username,
    admin: request.session.admin,
    csrfToken: request.csrfToken()
  });
});


server.get("/api/session", (request, response) => {
  if (!request.session.isLoggedIn) {
    response.sendStatus(403); // Forbidden
    return;
  }

  response.send({
    username: request.session.username,
    admin: request.session.admin
  });
});


// Logga in med github
server.post("/auth/github", async (request, response) => {

  request.session.isLoggedIn = false;
  request.session.username = null;
  response.redirect("/auth/github");

});

// Logga ut

server.post("/api/logout", async (request, response) => {

  request.session.isLoggedIn = false;
  request.session.username = null;
  response.redirect("/");

});


// post /posts    skapa nytt blogginlägg

server.post("/api/posts", csrfProtection, (request, response) => {
  if (!request.session.isLoggedIn) {
    response.sendStatus(403); // Forbidden
    return;
  }

  const body = request.body;

  // Kör sanitize för att skydda mot xss
  const title = sanitizeHtml(body.title);
  const text = sanitizeHtml(body.text);

  const newPost = new Post({
    title: title,
    text: text,
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
      comments: post.comments,
      likes: post.likes,
      canDeletePost: post.user === request.session.username || request.session.admin

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

// post //posts/:id/delete  raderar ett blogginlägg

server.post("/api/posts/:id/delete", async (request, response) => {
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

// post //posts/:id/comment  skapa en kommentar

server.post("/api/posts/:id/comment", async (request, response) => {
  if (!request.session.isLoggedIn) {
    response.sendStatus(403); // Forbidden
    return;
  }

  const body = request.body;

  const post = await Post.findById(request.params.id);

  post.comments.push({ user: request.session.username, text: body.text });

  post.save();

  console.log(post);

  try {
  } catch (error) {
    response.sendStatus(404); // Not found
    return;
  }

  response.redirect("/loggedin");
});

// oauth

server.get("/auth/github", (_request, response) => {
  const authUrl =
    "https://github.com/login/oauth/authorize?client_id=d822987213478bdae6fe";
  response.redirect(authUrl);
});

server.get("/auth/github/callback", async (request, response) => {
  const code = request.query.code;

  const githubResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: "d822987213478bdae6fe",
      client_secret: "3b5d9fc4456b9d57369adeca9c12c8e33c516c7c",
      code: code,
    }),

    headers: {
      Accept: "application/json",
    },
  });

  const jsonResponse = await githubResponse.json();

  const userInfo = await getUserInfoFromGitHub(jsonResponse.access_token);

  let user = await User.findOne({ "username": userInfo.login });

  if (user === null) {
    const users = await User.find();

    const admin = users.length === 0;

    user = new User({ username: userInfo.login, password: null, admin: admin });
    user.save();
  }

  request.session.username = userInfo.login;
  request.session.isLoggedIn = true;
  request.session.admin = user.admin;

  response.redirect("/loggedin");
});

const getUserInfoFromGitHub = async (access_token) => {
  const githubResponse = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${access_token}`,
    },
  });
  return await githubResponse.json();
};

server.get("/user", async (request, response) => {
  if (!request.session.access_token) {
    response.status(403).send("Access Denied.");
  }

  response.send(await response.json());
});


// Webb sockets

const likesWss = expressWs.getWss("/likes");
server.ws('/likes', function (ws, request) {
  ws.onmessage = async function (e) {
    if (!e.data) {
      return;
    }
    let likeObject = JSON.parse(e.data);
    const post = await Post.findById(likeObject.postId);

    if (!post) {
      return;
    }

    post.likes.push({ user: request.session.username });

    post.save();

    // Skicka till alla klienter att det finns en like 
    likesWss.clients.forEach((client) => {
      client.send(JSON.stringify({
        postId: likeObject.postId,
        user: request.session.username
      }));
    });
  };
});

server.listen(port, () => {
  console.log("Server startad: http://localhost:" + port);
})