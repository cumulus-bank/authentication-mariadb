import * as express from "express";
import * as logger from "morgan";
import * as bodyParser from "body-parser";
import * as passport from "passport";
import * as passportJWT from "passport-jwt";
import * as epimetheus from "epimetheus";
import * as jwt from "jsonwebtoken";
import * as passwordhash from "password-hash";

let mariadb = require("mariadb");

class App {
  public jwtOptions: any = {};
  public ExtractJwt = passportJWT.ExtractJwt;
  public JwtStrategy = passportJWT.ExtractJwt;
  public express: express.Application;
  public connectionString: any;
  public newdata: any = [];
  public pool: any;
  constructor() {
    this.jwtOptions.jwtFromRequest = this.ExtractJwt.fromAuthHeaderAsBearerToken();
    this.jwtOptions.secretOrKey = process.env.SECRET;
    this.connectionString = {
      host: process.env.HOST,
      user: process.env.UID,
      password: process.env.PASSWORD,
      database: process.env.DATABASE,
      connectionLimit: 5,
      port: process.env.PORT
    };
    this.pool = mariadb.createPool(this.connectionString);
    console.log(this.connectionString);
    this.express = express();
    epimetheus.instrument(this.express);
    this.middleware();
    this.routes();
  }
  private ensureToken(req, res, next) {
    const bearerHeader = req.headers["authorization"];
    if (typeof bearerHeader !== "undefined") {
      const bearer = bearerHeader.split(" ");
      const bearerToken = bearer[1];
      req.token = bearerToken;
      next();
    } else {
      res.sendStatus(403);
    }
  }
  private middleware(): void {
    this.express.use(function(req, res, next) {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Headers", "X-Requested-With,content-type"); 
      res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, PATCH, DELETE"); 
      next();
    });
    this.express.use(logger("dev"));
    this.express.use(bodyParser.json());
    this.express.use(passport.initialize());
    this.express.use(bodyParser.urlencoded({ extended: false }));
  }
  private routes(): void {
    let router = express.Router();
    router.post("/login", (req, res, next) => {
      this.pool
        .getConnection()
        .then(conn => {
          conn
            .query(
              "SELECT * FROM SAMPLE.UserData WHERE Email=?",
              [
                req.body.email
              ]
            )
            .then(data => {
              if (!data) {
                conn.end();
                res
                  .status(401)
                  .json({ message: "Please signup, no email exists" });
              } else if (
                passwordhash.verify(req.body.password, data[0]['Password'])
              ) {
                conn.end();
                console.log(process.env.SECRET);
                data = { data: data };
                res.json({
                  sucessful: true,
                  token: jwt.sign(data, process.env.SECRET)
                });
              } else {
                conn.end();
                res
                  .status(401)
                  .json({ message: "Password/Email did not match" });
              }
            })
            .catch(err => {
              conn.end();
              if (err) {
                res.status(404).json({ err });
                console.log(err);
              }
            });
        })
        .catch(err => {
          if (err) {
            res.status(404).json({ err });
            console.log(err);
          }
        });
    });

    router.post("/createUser", (req, res, next) => {
      this.newdata = [];
      this.pool
        .getConnection()
        .then(conn => {
          conn
            .query("insert into SAMPLE.UserData (LastName, FirstName, Email, Password, Age, Mobile) VALUES (?, ?, ?, ?, ?, ?)", [
              req.body.lastName,
              req.body.firstName,
              req.body.email,
              passwordhash.generate(req.body.password),
              req.body.age,
              req.body.mobile
            ])
            .then(data => {
              conn.end();
              res.json({
                message: "sucessful"
              });
            })
            .catch(err => {
              conn.end();
              if (err) {
                res.status(404).json({ err });
              }
            });
        })
        .catch(err => {
          if (err) {
            res.status(404).json({ err });
          }
        });
    });

    router.get("/healthz", (req, res, next) => {
      res.send("success");
    });
    this.express.use("/", router);
  }
}
export default new App().express;


