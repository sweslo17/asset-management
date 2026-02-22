"""Pydantic V2 data models for the portfolio updater."""

from typing import Literal

from pydantic import BaseModel, Field


class PriceRecord(BaseModel):
    """Represents a single closing price for a ticker on a given date."""

    ticker: str = Field(..., description="Asset ticker symbol, e.g. AAPL or 2330.TW")
    date: str = Field(..., description="Trading date in YYYY-MM-DD format")
    close: float = Field(..., description="Closing price in the asset's native currency")


class ExchangeRateRecord(BaseModel):
    """Represents a USD/TWD exchange rate on a given date."""

    date: str = Field(..., description="Trading date in YYYY-MM-DD format")
    usd_twd: float = Field(..., description="USD to TWD exchange rate")


class Investment(BaseModel):
    """Represents a single investment batch recorded in the portfolio sheet."""

    id: str = Field(..., description="Unique record identifier")
    batch_id: str = Field(..., description="Batch identifier grouping purchases in one transaction")
    ticker: str = Field(..., description="Asset ticker symbol")
    name: str = Field(..., description="Human-readable asset name")
    market: Literal["TW", "US"] = Field(..., description="Market where the asset trades")
    date: str = Field(..., description="Purchase date in YYYY-MM-DD format")
    units: float = Field(..., description="Number of units purchased")
    price_per_unit: float = Field(..., description="Purchase price per unit in native currency")
    exchange_rate: float = Field(..., description="USD/TWD rate at time of purchase (1.0 for TW assets)")
    fees: float = Field(..., description="Transaction fees in TWD")
    tags: str = Field(default="", description="Comma-separated tags for categorisation")
