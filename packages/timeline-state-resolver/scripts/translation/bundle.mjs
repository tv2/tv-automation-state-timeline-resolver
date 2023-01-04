/**
 * This script will read and bundle the translations in the project's .po files.
 * It is intended to be used by the Webpack config script.
 */
import { Transform } from 'stream'
import vfs from 'vinyl-fs'
import { writeFile } from 'fs/promises'
import { gettextToI18next } from 'i18next-conv'
import { readFile } from 'fs/promises'

import { conversionOptions } from './config.mjs'

class poToI18nextTransform extends Transform {
	constructor(namespace) {
		super({ objectMode: true })

		this._namespace = namespace
	}

	_transform(file, encoding, callback) {
		const start = Date.now()
		const language = file.dirname.split(/[/|\\]/).pop()
		const namespace = file.stem

		readFile(file.path, 'utf-8')
			.then((poFile) => {
				if (!poFile) {
					return null
				}

				return gettextToI18next(
					language,
					poFile,
					Object.assign({}, conversionOptions, {
						language,
						// Keys with no value will fall back to default bundle, and eventually the key itself will
						// be used as value if no values are found. Since we use the string as key, this means
						// untranslated keys will be represented by their original (English) text. This is not great
						// but better than inserting empty strings everywhere.
						skipUntranslated: true,
						ns: file.stem,
					})
				)
			})
			.then(JSON.parse)
			.then((data) => {
				console.info(
					`Processed ${namespace} ${language} (${Object.keys(data).length} translated keys) (${Date.now() - start} ms)`
				)
				callback(null, {
					type: 'i18next',
					language,
					namespace,
					data,
				})
			})
			.catch(callback)
	}
}

function mergeByLanguage(translations) {
	const languages = {}

	for (const translation of translations) {
		const { language, data } = translation
		if (!languages[language]) {
			languages[language] = data
		} else {
			Object.assign(languages[language], data)
		}
	}

	return Object.keys(languages).map((language) => ({ language, data: languages[language], type: 'i18next' }))
}

async function getTranslationsInner(translations) {
	const out = []
	for await (const translation of translations) {
		out.push(translation)
	}

	console.info('Translations bundling complete.')

	return mergeByLanguage(out)
}

export async function getTranslations(sources) {
	const resolvedSources = new Set()
	for (const source of Object.values(sources)) {
		resolvedSources.add(source.root)
		for (const ref of source.refs || []) {
			resolvedSources.add(ref)
		}
	}

	const namespaceFileNames = []
	for (const source of resolvedSources.values()) {
		namespaceFileNames.push(`locales/**/${source}.po`)
	}

	console.info('Bundling translations...')

	const translations = vfs.src(namespaceFileNames).pipe(new poToI18nextTransform())

	return getTranslationsInner(translations)
}

;(async function () {
	const bundledTranslations = await getTranslations({
		'timeline-state-resolver': { root: 'timeline-state-resolver', refs: [] },
	})

	await writeFile('./dist/translations.json', JSON.stringify(bundledTranslations))
})()
