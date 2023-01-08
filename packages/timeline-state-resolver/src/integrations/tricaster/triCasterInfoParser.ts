import { ElementCompact, xml2js } from 'xml-js'

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

export class TriCasterInfoParser {
	parseSwitcherUpdate(switcherUpdateXml: string): TriCasterSwitcherInfo {
		const parsedSwitcher = xml2js(switcherUpdateXml, { compact: true }) as ElementCompact
		const inputCount =
			parsedSwitcher.switcher_update?.inputs?.physical_input?.filter((input: ElementCompact) =>
				/Input\d+/.test(input._attributes?.physical_input_number?.toString() ?? '')
			).length ?? 0
		const dskCount = parsedSwitcher.switcher_update?.switcher_overlays?.overlay?.length
		const meCount =
			parsedSwitcher.switcher_update?.inputs?.simulated_input?.filter((input: ElementCompact) =>
				/V\d+/.test(input._attributes?.simulated_input_number?.toString() ?? '')
			).length ?? 0
		const ddrCount =
			parsedSwitcher.switcher_update?.inputs?.simulated_input?.filter((input: ElementCompact) =>
				/DDR\d+/.test(input._attributes?.simulated_input_number?.toString() ?? '')
			).length ?? 0

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
			productModel: parsedProduct.product_information?.product_model?._text,
			sessionName: parsedProduct.product_information?.session_name?._text,
			outputCount: Number(parsedProduct.product_information?.output_count?._text),
		}
	}
}
