"""Fetch USD/TWD exchange rates via yfinance."""

from __future__ import annotations

from datetime import date, timedelta

import yfinance as yf
from loguru import logger

from .models import ExchangeRateRecord

_USDTWD_TICKER = "USDTWD=X"


def fetch_recent_rates(days: int = 5) -> list[ExchangeRateRecord]:
    """Fetch the most recent *days* trading-day USD/TWD exchange rates.

    Parameters
    ----------
    days:
        Number of recent trading days to fetch.  Defaults to 5.

    Returns
    -------
    list[ExchangeRateRecord]
        List of exchange rate records sorted by date ascending.
        Returns an empty list on failure, with a warning logged.
    """
    lookback = days * 3
    start = (date.today() - timedelta(days=lookback)).isoformat()
    logger.info(
        "Fetching recent {} trading days of USD/TWD rates (window start: {})",
        days,
        start,
    )
    return _download(start=start, tail=days)


def fetch_historical_rates(start_date: str) -> list[ExchangeRateRecord]:
    """Fetch all USD/TWD exchange rates from *start_date* to today.

    Parameters
    ----------
    start_date:
        ISO-format date string ``YYYY-MM-DD`` representing the earliest date to fetch.

    Returns
    -------
    list[ExchangeRateRecord]
        List of exchange rate records sorted by date ascending.
        Returns an empty list on failure, with a warning logged.
    """
    logger.info("Fetching historical USD/TWD rates from {}", start_date)
    return _download(start=start_date, tail=None)


# ------------------------------------------------------------------
# Private helpers
# ------------------------------------------------------------------


def _download(start: str, tail: int | None) -> list[ExchangeRateRecord]:
    """Download USD/TWD rate data and convert to ``ExchangeRateRecord`` objects.

    Parameters
    ----------
    start:
        Start date for the download window (``YYYY-MM-DD``).
    tail:
        If provided, only the last *tail* rows are retained.
    """
    try:
        logger.debug("Downloading {} from {}", _USDTWD_TICKER, start)
        data = yf.download(
            _USDTWD_TICKER,
            start=start,
            auto_adjust=True,
            progress=False,
            multi_level_index=False,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to fetch USD/TWD rates: {}", exc)
        return []

    if data.empty:
        logger.warning("No data returned for ticker '{}'", _USDTWD_TICKER)
        return []

    close_series = data["Close"].dropna()

    if tail is not None:
        close_series = close_series.tail(tail)

    records: list[ExchangeRateRecord] = [
        ExchangeRateRecord(
            date=idx.date().isoformat(),  # type: ignore[union-attr]
            usd_twd=float(close_val),
        )
        for idx, close_val in close_series.items()
    ]
    logger.debug("Parsed {} USD/TWD rate records", len(records))
    return records
