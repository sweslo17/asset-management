"""Fetch historical and recent closing prices via yfinance."""

from __future__ import annotations

from datetime import date, timedelta

import yfinance as yf
from loguru import logger

from .models import PriceRecord


def fetch_recent_prices(tickers: list[str], days: int = 5) -> list[PriceRecord]:
    """Fetch the most recent *days* trading-day closing prices for each ticker.

    Parameters
    ----------
    tickers:
        List of yfinance-compatible ticker symbols, e.g. ``["AAPL", "2330.TW"]``.
    days:
        Number of recent trading days to fetch.  Defaults to 5.

    Returns
    -------
    list[PriceRecord]
        Flat list of price records across all tickers, sorted by ticker then date.
        Tickers that fail to download are skipped with a warning.
    """
    # Fetch a window that is comfortably larger than *days* to account for
    # weekends and public holidays in different markets.
    lookback = days * 3
    start = (date.today() - timedelta(days=lookback)).isoformat()
    logger.info(
        "Fetching recent {} trading days of prices for {} ticker(s) (window start: {})",
        days,
        len(tickers),
        start,
    )
    return _download(tickers, start=start, tail=days)


def fetch_historical_prices(tickers: list[str], start_date: str) -> list[PriceRecord]:
    """Fetch all closing prices from *start_date* to today for each ticker.

    Parameters
    ----------
    tickers:
        List of yfinance-compatible ticker symbols.
    start_date:
        ISO-format date string ``YYYY-MM-DD`` representing the earliest date to fetch.

    Returns
    -------
    list[PriceRecord]
        Flat list of price records across all tickers.
        Tickers that fail to download are skipped with a warning.
    """
    logger.info(
        "Fetching historical prices for {} ticker(s) from {}",
        len(tickers),
        start_date,
    )
    return _download(tickers, start=start_date, tail=None)


# ------------------------------------------------------------------
# Private helpers
# ------------------------------------------------------------------


def _download(tickers: list[str], start: str, tail: int | None) -> list[PriceRecord]:
    """Download price data for *tickers* and convert to ``PriceRecord`` objects.

    Parameters
    ----------
    tickers:
        Ticker symbols to download.
    start:
        Start date for the download window (``YYYY-MM-DD``).
    tail:
        If provided, only the last *tail* rows per ticker are retained.
    """
    records: list[PriceRecord] = []

    for ticker in tickers:
        try:
            records.extend(_download_single(ticker, start=start, tail=tail))
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed to fetch prices for ticker '{}': {}", ticker, exc)

    logger.debug("Total price records fetched: {}", len(records))
    return records


def _download_single(ticker: str, start: str, tail: int | None) -> list[PriceRecord]:
    """Download and parse closing prices for a single *ticker*.

    Raises on network / parsing errors so that the caller can decide whether
    to skip or propagate.
    """
    logger.debug("Downloading '{}' from {}", ticker, start)
    data = yf.download(
        ticker,
        start=start,
        auto_adjust=True,
        progress=False,
        multi_level_index=False,
    )

    if data.empty:
        logger.warning("No data returned for ticker '{}'", ticker)
        return []

    close_series = data["Close"].dropna()

    if tail is not None:
        close_series = close_series.tail(tail)

    price_records: list[PriceRecord] = [
        PriceRecord(
            ticker=ticker,
            date=idx.date().isoformat(),  # type: ignore[union-attr]
            close=float(close_val),
        )
        for idx, close_val in close_series.items()
    ]
    logger.debug("Parsed {} price records for '{}'", len(price_records), ticker)
    return price_records
