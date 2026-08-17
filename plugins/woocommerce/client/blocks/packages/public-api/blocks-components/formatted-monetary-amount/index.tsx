/**
 * External dependencies
 */
import NumberFormat from 'react-number-format';
import type {
	NumberFormatValues,
	NumberFormatProps,
} from 'react-number-format';
import clsx from 'clsx';
import type { ReactElement, ReactNode } from 'react';
import type { Currency } from '@woocommerce/types';
import { SITE_CURRENCY } from '@woocommerce/settings';
import { decodeHtmlEntities } from '@woocommerce/utils';

/**
 * Internal dependencies
 */
import './style.scss';

export interface FormattedMonetaryAmountProps
	extends Omit< NumberFormatProps, 'onValueChange' | 'displayType' > {
	className?: string;
	displayType?: NumberFormatProps[ 'displayType' ] | undefined;
	allowNegative?: boolean;
	isAllowed?: ( formattedValue: NumberFormatValues ) => boolean;
	value: number | string; // Value of money amount.
	currency?: Currency | undefined; // Currency configuration object. Defaults to site currency.
	onValueChange?: ( unit: number ) => void; // Function to call when value changes.
	style?: React.CSSProperties | undefined;
	renderText?: ( value: string ) => JSX.Element;
}

/**
 * Splits a currency prefix or suffix into the symbol and the spacing around it,
 * which the position setting bakes into the same string: "left with space"
 * gives "€ ", "left" gives "€".
 *
 * The spacing is returned separately so it can be placed outside the isolating
 * element; inside an RTL isolate a trailing space is drawn on the wrong side of
 * the symbol.
 */
const splitCurrencySymbolAndSpacing = ( currencySymbol: string ) => {
	const [ , before = '', symbol = '', after = '' ] =
		currencySymbol.match( /^(\s*)(.*?)(\s*)$/ ) || [];
	return { before, symbol, after };
};

/**
 * Renders the currency symbol in its own element, mirroring the
 * `woocommerce-Price-currencySymbol` span `wc_price()` emits.
 *
 * `dir="auto"` keeps the symbol a self-contained run, so it cannot pull the
 * neighbouring digits into a right-to-left run and land on the wrong side of
 * the amount. A span is used rather than a nested `<bdi>` because
 * `wp_kses_post()` strips `bdi` but keeps the `dir` attribute.
 */
const renderIsolatedSymbol = ( currencySymbol: string ): ReactNode => {
	const { before, symbol, after } =
		splitCurrencySymbolAndSpacing( currencySymbol );

	if ( ! symbol ) {
		return currencySymbol;
	}

	return (
		<>
			{ before }
			<span dir="auto">{ symbol }</span>
			{ after }
		</>
	);
};

/**
 * Formats currency separators into the expected format for NumberFormat.
 */
const currencyToNumberFormat = ( currency: Currency ) => {
	const { thousandSeparator, decimalSeparator } = currency;
	// Decode HTML entities in separators
	const decodedThousandSeparator = decodeHtmlEntities( thousandSeparator );
	const decodedDecimalSeparator = decodeHtmlEntities( decimalSeparator );

	const hasDuplicateSeparator =
		decodedThousandSeparator === decodedDecimalSeparator;
	if ( hasDuplicateSeparator ) {
		// eslint-disable-next-line no-console
		console.warn(
			'Thousand separator and decimal separator are the same. This may cause formatting issues.'
		);
	}
	return {
		thousandSeparator: hasDuplicateSeparator
			? ''
			: decodedThousandSeparator,
		decimalSeparator: decodedDecimalSeparator,
		fixedDecimalScale: true,
		isNumericString: true,
	};
};

/**
 * NumberFormat passes the remaining props to the element it renders in text
 * mode; the typings only declare the first argument.
 */
type IsolatedRenderText = (
	formattedValue: string,
	spanProps: Record< string, unknown >
) => ReactElement;

/**
 * Builds the NumberFormat `renderText` callback that composes a price out of
 * elements, matching the structure `wc_price()` produces.
 *
 * NumberFormat renders nothing of its own once `renderText` is set, so the
 * props it would have applied to its span arrive as the second argument and are
 * spread here instead.
 */
const createStructuredPriceRenderer =
	( {
		prefix,
		suffix,
		getInputRef,
	}: {
		prefix: string;
		suffix: string;
		getInputRef?: NumberFormatProps[ 'getInputRef' ] | undefined;
	} ): IsolatedRenderText =>
	( formattedValue, spanProps ) => {
		// `wc_price()` puts the negative sign inside the `<bdi>`, ahead of the
		// symbol, so split it off the amount.
		const isNegative = formattedValue.startsWith( '-' );

		return (
			<span { ...spanProps } ref={ getInputRef }>
				<bdi>
					{ isNegative ? '-' : '' }
					{ renderIsolatedSymbol( prefix ) }
					{ isNegative ? formattedValue.slice( 1 ) : formattedValue }
					{ renderIsolatedSymbol( suffix ) }
				</bdi>
			</span>
		);
	};

/**
 * FormattedMonetaryAmount component.
 *
 * Takes a price and returns a formatted price using the NumberFormat component.
 *
 * More detailed docs on the additional props can be found here:https://s-yadav.github.io/react-number-format/docs/intro
 */
const FormattedMonetaryAmount = ( {
	className,
	value: rawValue,
	currency: rawCurrency = SITE_CURRENCY,
	onValueChange,
	displayType = 'text',
	...props
}: FormattedMonetaryAmountProps ): ReactElement | null => {
	// Merge currency configuration with site currency.
	const currency = {
		...SITE_CURRENCY,
		...rawCurrency,
	};

	// Convert values to int.
	const value =
		typeof rawValue === 'string' ? parseInt( rawValue, 10 ) : rawValue;

	if ( ! Number.isFinite( value ) ) {
		return null;
	}

	const priceValue = value / 10 ** currency.minorUnit;

	if ( ! Number.isFinite( priceValue ) ) {
		return null;
	}

	const classes = clsx(
		'wc-block-formatted-money-amount',
		'wc-block-components-formatted-money-amount',
		className
	);
	const decimalScale = props.decimalScale ?? currency?.minorUnit;
	const decodedPrefix = decodeHtmlEntities( currency.prefix );
	const decodedSuffix = decodeHtmlEntities( currency.suffix );

	// Compose the price as markup so it matches the structure `wc_price()`
	// produces everywhere else in the store. An input value cannot hold
	// elements, and a consumer-supplied renderText owns its output, so both keep
	// the plain string.
	const renderAsMarkup = displayType === 'text' && ! props.renderText;

	const numberFormatProps = {
		...props,
		...currencyToNumberFormat( currency ),
		prefix: renderAsMarkup ? '' : decodedPrefix,
		suffix: renderAsMarkup ? '' : decodedSuffix,
		decimalScale,
		value: undefined,
		currency: undefined,
		onValueChange: undefined,
	};

	if ( renderAsMarkup ) {
		numberFormatProps.renderText = createStructuredPriceRenderer( {
			prefix: decodedPrefix,
			suffix: decodedSuffix,
			getInputRef: props.getInputRef,
		} ) as unknown as NonNullable<
			FormattedMonetaryAmountProps[ 'renderText' ]
		>;
	}

	// Wrapper for NumberFormat onValueChange which handles subunit conversion.
	const onValueChangeWrapper = onValueChange
		? ( values: NumberFormatValues ) => {
				const minorUnitValue = +values.value * 10 ** currency.minorUnit;
				onValueChange( minorUnitValue );
		  }
		: () => void 0;

	return (
		<NumberFormat
			className={ classes }
			displayType={ displayType }
			translate="no"
			{ ...numberFormatProps }
			value={ priceValue }
			onValueChange={ onValueChangeWrapper }
		/>
	);
};

export default FormattedMonetaryAmount;
