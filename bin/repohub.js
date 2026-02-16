#!/usr/bin/env node
import { register } from 'node:module'

register('./loader.js', import.meta.url)
await import('../dist/server/server/index.js')
