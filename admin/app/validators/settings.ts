import vine from "@vinejs/vine";
import { SETTINGS_KEYS } from "../../constants/kv_store.js";

export const getSettingSchema = vine.compile(vine.object({
    key: vine.enum(SETTINGS_KEYS),
}))

export const updateSettingSchema = vine.compile(vine.object({
    key: vine.enum(SETTINGS_KEYS),
    value: vine.any().optional(),
}))