import express from "express";
import { createBnplOrder } from "../controllers/bnplController.js";

const router = express.Router();

router.post("/create-order", createBnplOrder);

router.post("/", createBnplOrder);

export default router;
