import {
	TriCasterAudioChannelName,
	TriCasterInputName,
	TriCasterKeyerName,
	TriCasterLayerName,
	TriCasterMatrixOutputName,
	TriCasterMixEffectName,
	TriCasterMixOutputName,
	TriCasterSourceName,
} from 'timeline-state-resolver-types'
import { ElementCompact, xml2js } from 'xml-js'
import { fillArray } from './util'

const MATRIX_OUTPUTS_COUNT = 8 // @todo: hardcoded for now; only a few models have this feature; how to query for it?

export interface TriCasterSwitcherInfo {
	inputCount: number
	meCount: number
	dskCount: number
	ddrCount: number
}

export interface TriCasterProductInfo {
	productModel: string
	sessionName: string
	outputCount: number
}

export interface TriCasterResourceNames {
	mixEffects: TriCasterMixEffectName[]
	inputs: TriCasterInputName[]
	audioChannels: TriCasterAudioChannelName[]
	layers: TriCasterLayerName[]
	keyers: TriCasterKeyerName[]
	mixOutputs: TriCasterMixOutputName[]
	matrixOutputs: TriCasterMatrixOutputName[]
}
export interface TriCasterInfo extends TriCasterSwitcherInfo, TriCasterProductInfo {
	availableResourceNames: TriCasterResourceNames
}

export class TriCasterInfoParser {
	parseSwitcherUpdate(switcherUpdateXml: string): TriCasterSwitcherInfo {
		const parsedSwitcher = xml2js(switcherUpdateXml, { compact: true }) as ElementCompact
		const dskCount: number = (parsedSwitcher.switcher_update?.switcher_overlays?.overlay?.length ?? 5) - 1 // @todo why does the xml contain one more? probably it has something to do with previz or background
		const inputs = parsedSwitcher.switcher_update?.inputs
		const inputCount: number =
			inputs?.physical_input?.filter((input: ElementCompact) =>
				/Input\d+/.test(input._attributes?.physical_input_number?.toString() ?? '')
			).length ?? 32
		const meCount: number =
			inputs?.simulated_input?.filter((input: ElementCompact) =>
				/V\d+/.test(input._attributes?.simulated_input_number?.toString() ?? '')
			).length ?? 8
		const ddrCount: number =
			inputs?.simulated_input?.filter((input: ElementCompact) =>
				/DDR\d+/.test(input._attributes?.simulated_input_number?.toString() ?? '')
			).length ?? 4

		return {
			inputCount,
			dskCount,
			meCount,
			ddrCount,
		}
	}

	parseProductInformation(productInformationXml: string): TriCasterProductInfo {
		const parsedProduct = xml2js(productInformationXml, { compact: true }) as ElementCompact

		return {
			productModel: parsedProduct.product_information?.product_model?._text ?? '',
			sessionName: parsedProduct.product_information?.session_name?._text ?? '',
			outputCount: Number(parsedProduct.product_information?.output_count?._text ?? 8),
		}
	}

	getAvailableResources(
		switcherInfo: TriCasterSwitcherInfo,
		productInfo: TriCasterProductInfo
	): TriCasterResourceNames {
		const mixEffects: TriCasterMixEffectName[] = [
			'main',
			...fillArray<TriCasterMixEffectName>(switcherInfo.meCount, (i) => `v${i + 1}`),
		]
		const keyers = fillArray<TriCasterKeyerName>(switcherInfo.dskCount, (i) => `dsk${i + 1}`)
		const layers: TriCasterLayerName[] = ['a', 'b', 'c', 'd']
		const inputs = fillArray<TriCasterInputName>(switcherInfo.inputCount, (i) => `input${i + 1}`)
		const extraAudioChannelNames: TriCasterAudioChannelName[] = [
			...fillArray<TriCasterSourceName>(switcherInfo.ddrCount, (i) => `ddr${i + 1}`),
			'sound',
			'master',
		]
		const audioChannels = [...extraAudioChannelNames, ...inputs]
		const mixOutputs = fillArray<TriCasterMixOutputName>(productInfo.outputCount, (i) => `mix${i + 1}`)
		const matrixOutputs = fillArray<TriCasterMatrixOutputName>(MATRIX_OUTPUTS_COUNT, (i) => `out${i + 1}`)

		return {
			mixEffects,
			keyers,
			layers,
			inputs,
			audioChannels,
			mixOutputs,
			matrixOutputs,
		}
	}
}
