import React from 'react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Database, Key, Link as LinkIcon, ArrowRight } from 'lucide-react';

export const SchemaErdView: React.FC<{ selectedTableName: string; onSelectTable: (tableName: string) => void }> = ({
  selectedTableName,
  onSelectTable,
}) => {
  const erdEntities = [
    {
      name: 'CUSTOMER_DIM',
      schema: 'CUSTOMERS',
      pk: 'CUSTOMER_ID',
      fields: ['CUSTOMER_ID (PK)', 'CUSTOMER_UUID', 'FIRST_NAME', 'EMAIL', 'CUSTOMER_TIER'],
      relation: '1 : N with ORDER_FACT',
      color: 'border-stone-300',
    },
    {
      name: 'ORDER_FACT',
      schema: 'SALES',
      pk: 'ORDER_ID',
      fields: ['ORDER_ID (PK)', 'CUSTOMER_ID (FK)', 'PRODUCT_ID (FK)', 'ORDER_TIMESTAMP', 'NET_AMOUNT', 'TOTAL_AMOUNT'],
      relation: 'Core Fact Table',
      color: 'border-stone-900 shadow-sm',
    },
    {
      name: 'PRODUCT_DIM',
      schema: 'PRODUCTS',
      pk: 'PRODUCT_ID',
      fields: ['PRODUCT_ID (PK)', 'SKU', 'PRODUCT_NAME', 'CATEGORY_NAME', 'UNIT_PRICE_USD'],
      relation: '1 : N with ORDER_FACT',
      color: 'border-stone-300',
    },
    {
      name: 'SALES_TRANSACTIONS',
      schema: 'SALES',
      pk: 'TRANSACTION_ID',
      fields: ['TRANSACTION_ID (PK)', 'ORDER_ID (FK)', 'PAYMENT_GATEWAY', 'AUTH_CODE', 'SETTLE_AMOUNT'],
      relation: 'N : 1 with ORDER_FACT',
      color: 'border-stone-300',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-semibold text-stone-900">Entity-Relationship Diagram (ERD)</h3>
          <p className="text-xs text-stone-500">Conformed dimensions and transactional relationships in RETAIL_ANALYTICS</p>
        </div>
        <Badge variant="navy">Snowflake Normalized</Badge>
      </div>

      <div className="p-6 bg-[#fbfbf9] rounded-xl border border-stone-200/90 overflow-x-auto">
        <div className="min-w-[700px] flex items-center justify-between gap-6 relative">
          {/* Left Dimensions */}
          <div className="flex flex-col gap-6 flex-1">
            {/* Customer Dim */}
            <div
              onClick={() => onSelectTable('CUSTOMER_DIM')}
              className={`p-3.5 bg-white rounded-lg border-2 cursor-pointer transition-all hover:border-stone-500 ${
                selectedTableName === 'CUSTOMER_DIM' ? 'border-stone-900 ring-2 ring-stone-900/10' : 'border-stone-200'
              }`}
            >
              <div className="flex items-center justify-between border-b border-stone-100 pb-2 mb-2">
                <span className="font-mono-code font-bold text-xs text-stone-900">CUSTOMER_DIM</span>
                <span className="text-[10px] text-stone-400 font-mono-code">CUSTOMERS</span>
              </div>
              <ul className="text-[11px] font-mono-code text-stone-600 space-y-1">
                <li className="font-bold text-stone-900 flex items-center gap-1">
                  <Key className="w-2.5 h-2.5 text-amber-600" /> CUSTOMER_ID [PK]
                </li>
                <li>FIRST_NAME VARCHAR</li>
                <li>EMAIL VARCHAR</li>
                <li>CUSTOMER_TIER VARCHAR</li>
              </ul>
            </div>

            {/* Product Dim */}
            <div
              onClick={() => onSelectTable('PRODUCT_DIM')}
              className={`p-3.5 bg-white rounded-lg border-2 cursor-pointer transition-all hover:border-stone-500 ${
                selectedTableName === 'PRODUCT_DIM' ? 'border-stone-900 ring-2 ring-stone-900/10' : 'border-stone-200'
              }`}
            >
              <div className="flex items-center justify-between border-b border-stone-100 pb-2 mb-2">
                <span className="font-mono-code font-bold text-xs text-stone-900">PRODUCT_DIM</span>
                <span className="text-[10px] text-stone-400 font-mono-code">PRODUCTS</span>
              </div>
              <ul className="text-[11px] font-mono-code text-stone-600 space-y-1">
                <li className="font-bold text-stone-900 flex items-center gap-1">
                  <Key className="w-2.5 h-2.5 text-amber-600" /> PRODUCT_ID [PK]
                </li>
                <li>SKU VARCHAR</li>
                <li>PRODUCT_NAME VARCHAR</li>
                <li>UNIT_PRICE_USD NUMBER</li>
              </ul>
            </div>
          </div>

          {/* Connector Arrows */}
          <div className="flex flex-col items-center justify-around h-64 text-stone-400">
            <div className="flex items-center gap-1 text-[10px] font-mono-code bg-white px-1.5 py-0.5 rounded border border-stone-200 shadow-2xs">
              <span>FK: 1 to N</span>
              <ArrowRight className="w-3 h-3" />
            </div>
            <div className="flex items-center gap-1 text-[10px] font-mono-code bg-white px-1.5 py-0.5 rounded border border-stone-200 shadow-2xs">
              <span>FK: 1 to N</span>
              <ArrowRight className="w-3 h-3" />
            </div>
          </div>

          {/* Center Fact Table */}
          <div className="flex-1">
            <div
              onClick={() => onSelectTable('ORDER_FACT')}
              className={`p-4 bg-white rounded-lg border-2 cursor-pointer transition-all hover:border-stone-500 ${
                selectedTableName === 'ORDER_FACT' ? 'border-stone-900 ring-2 ring-stone-900/10' : 'border-stone-300'
              }`}
            >
              <div className="flex items-center justify-between border-b border-stone-100 pb-2 mb-2">
                <div>
                  <span className="font-mono-code font-bold text-xs text-stone-900">ORDER_FACT</span>
                  <div className="text-[10px] text-stone-400 font-mono-code">RETAIL_ANALYTICS.SALES</div>
                </div>
                <Badge variant="navy" size="xs">
                  Central Fact
                </Badge>
              </div>

              <ul className="text-[11px] font-mono-code text-stone-700 space-y-1">
                <li className="font-bold text-stone-900 flex items-center gap-1">
                  <Key className="w-2.5 h-2.5 text-amber-600" /> ORDER_ID NUMBER [PK]
                </li>
                <li className="text-sky-800 flex items-center gap-1">
                  <LinkIcon className="w-2.5 h-2.5 text-sky-600" /> CUSTOMER_ID NUMBER [FK]
                </li>
                <li className="text-sky-800 flex items-center gap-1">
                  <LinkIcon className="w-2.5 h-2.5 text-sky-600" /> PRODUCT_ID NUMBER [FK]
                </li>
                <li>ORDER_TIMESTAMP TIMESTAMP</li>
                <li>NET_AMOUNT NUMBER(18,2)</li>
                <li>TAX_AMOUNT NUMBER(18,2)</li>
                <li>TOTAL_AMOUNT NUMBER(18,2)</li>
                <li>ORDER_STATUS VARCHAR</li>
              </ul>
            </div>
          </div>

          {/* Connector to Transactions */}
          <div className="flex items-center gap-1 text-[10px] font-mono-code bg-white px-1.5 py-0.5 rounded border border-stone-200 shadow-2xs text-stone-400">
            <span>1 to N</span>
            <ArrowRight className="w-3 h-3" />
          </div>

          {/* Right Child Table */}
          <div className="flex-1">
            <div
              onClick={() => onSelectTable('ORDER_FACT')}
              className="p-3.5 bg-white rounded-lg border-2 border-stone-200 cursor-pointer hover:border-stone-400 transition-all"
            >
              <div className="flex items-center justify-between border-b border-stone-100 pb-2 mb-2">
                <span className="font-mono-code font-bold text-xs text-stone-900">SALES_TRANSACTIONS</span>
                <span className="text-[10px] text-stone-400 font-mono-code">SALES</span>
              </div>
              <ul className="text-[11px] font-mono-code text-stone-600 space-y-1">
                <li className="font-bold text-stone-900 flex items-center gap-1">
                  <Key className="w-2.5 h-2.5 text-amber-600" /> TRANSACTION_ID [PK]
                </li>
                <li className="text-sky-800 flex items-center gap-1">
                  <LinkIcon className="w-2.5 h-2.5 text-sky-600" /> ORDER_ID [FK]
                </li>
                <li>PAYMENT_GATEWAY VARCHAR</li>
                <li>SETTLE_AMOUNT NUMBER</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
