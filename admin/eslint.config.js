import { configApp } from '@adonisjs/eslint-config'
import pluginQuery from '@tanstack/eslint-plugin-query'
export default configApp(...pluginQuery.configs['flat/recommended'])
