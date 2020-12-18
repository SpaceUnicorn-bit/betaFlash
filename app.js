require("dotenv").config();
const express = require("express");
const http = require("http");
const Web3 = require("web3");
const sound = require("sound-play");
const uniswapSdk = require("@uniswap/sdk");
const chainId = uniswapSdk.ChainId.MAINNET;
const HDWalletProvider = require("@truffle/hdwallet-provider");
const legos = require("@studydefi/money-legos");
const abis = require("./abis");
const addresses = require("./addresses");
const ethers = require("ethers");

// WEB3 CONFIG
const web3 = new Web3(
    new HDWalletProvider(process.env.PRIVATE_KEY, process.env.INFURA_URL)
);
//const eventProvider = new Web3.providers.WebsocketProvider(process.env.RPC_URL);
const eventProvider = new Web3(
    new Web3.providers.WebsocketProvider(process.env.INFURA_URL)
);

const { address: admin } = web3.eth.accounts.wallet.add(
    process.env.PRIVATE_KEY
);

// SERVER CONFIG
const PORT = process.env.PORT || 4000;
const app = express();
const server = http
    .createServer(app)
    .listen(PORT, () => console.log(`Listening on ${PORT}`));

const kyber = new web3.eth.Contract(
    abis.kyber.kyberNetworkProxy,
    addresses.mainnet.kyber.kyberNetworkProxy
);

//CONFIG DEL FLASHLOAN
const ONE_WEI = web3.utils.toBN(web3.utils.toWei("1"));
const AMOUNT_DAI_WEI = web3.utils.toBN(web3.utils.toWei("10000"));
const AMOUNT_ETH_WEI = web3.utils.toBN(web3.utils.toWei("65"));
const DIRECTION = {
    KYBER_TO_UNISWAP: 0,
    UNISWAP_TO_KYBER: 1,
};

async function checkPrices(args) {
    const { inputTokenSymbol, inputTokenAddress, outputTokenSymbol, outputTokenAddress, inputAmount } = args
    
 
    eventProvider.eth.subscribe('newBlockHeaders').on('data', async block => {
       //console.log(`New block received. Block # ${block.number}`);

        //Uniswap pairs
        const decimals = 18;
        const outputToken = new uniswapSdk.Token(chainId, outputTokenAddress, decimals, outputTokenSymbol, 'coin');
        const pairBuy = await uniswapSdk.Fetcher.fetchPairData(outputToken, uniswapSdk.WETH[chainId]);
        const pairSell = await uniswapSdk.Fetcher.fetchPairData(uniswapSdk.WETH[chainId], outputToken);

        const routeSell = new uniswapSdk.Route([pairSell], outputToken, uniswapSdk.WETH[chainId]);
        const routeBuy = new uniswapSdk.Route([pairBuy], uniswapSdk.WETH[chainId]);


        const tradeBuy = new uniswapSdk.Trade(routeBuy, new uniswapSdk.TokenAmount(
            uniswapSdk.WETH[chainId],
            1000000000000000000
        ), uniswapSdk.TradeType.EXACT_INPUT);
        const tradeSell = new uniswapSdk.Trade(routeSell, new uniswapSdk.TokenAmount(
            outputToken,
            1000000000000000000
        ), uniswapSdk.TradeType.EXACT_INPUT);

        const kyberResultsBuy = await kyber.methods.getExpectedRate(
            inputTokenAddress,
            outputTokenAddress, inputAmount
        ).call();
        const kyberResultsSell = await kyber.methods.getExpectedRate(
            outputTokenAddress,
            inputTokenAddress,
            inputAmount
        ).call();
      
        let  buy = tradeBuy.executionPrice.toSignificant(18);
        let sell = tradeSell.executionPrice.invert().toSignificant(18);
      
        //este es el fino, no la cague  
        const kyberRates = {
          buy: parseFloat(web3.utils.fromWei(kyberResultsBuy.expectedRate)),
          sell: parseFloat( 1 / web3.utils.fromWei(kyberResultsSell.expectedRate) )
        };
        await CheckProfit(buy, kyberRates.buy, sell,kyberRates.sell,buy, sell, outputTokenSymbol);

    }).on('error', error => {
      console.log(error);
    });
}

async function CheckProfit(
    buyUniswapPrice, buyKyberPrice,
    sellUniswapPrice, sellKyberPrice,
    priceBuyCurrent, priceSellCurrent, outputTokenSymbol) {
    const [gasPrice, gasCost1, gasCost2] = await Promise.all([
      web3.eth.getGasPrice(),
      web3.eth.estimateGas({from: admin}),
      web3.eth.estimateGas({from: admin}),
    ]);
  
    const txCost1 = parseInt(gasCost1) * parseInt(gasPrice);
    const txCost2 = parseInt(gasCost2) * parseInt(gasPrice);
    const currentEthPrice = (Number(priceBuyCurrent) + Number(priceSellCurrent)) / 2;
    const profit1 = (parseInt(AMOUNT_ETH_WEI) / 10 ** 18) * (buyKyberPrice - sellUniswapPrice) - (txCost1 / 10 ** 18) * currentEthPrice;
    const profit2 = (parseInt(AMOUNT_ETH_WEI) / 10 ** 18) * (buyUniswapPrice - sellKyberPrice) - (txCost2 / 10 ** 18) * currentEthPrice;

    if(profit1 > 6) {
      console.log('Arb opportunity found!');
      console.table([{
        'Output Token': outputTokenSymbol,
        'buy on Kyber': buyKyberPrice,
        'Uniswap sell':sellUniswapPrice,
        'profit' : profit1,
      }]);
      sound.play('C://wamp64/www/akuaku.mp4')
    } else if(profit2 > 6) {
      console.log('Arb opportunity found!');
      console.table([{
        'Output Token': outputTokenSymbol,
        'buy on uniswap': buyUniswapPrice,
        'sell on kyber':sellKyberPrice,
        'profit' : profit2,
      }]);
      /*console.table([{
        'Output Token': outputTokenSymbol,
        'Uniswap buy': buyUniswapPrice,
        'Uniswap sell':sellUniswapPrice,
        'Kyber buy': buyKyberPrice,
        'Kyber sell':sellKyberPrice,
        'profit1' : profit1,
        'profit2' : profit2,
      }]);*/
      sound.play('C://wamp64/www/akuaku.mp4')
    } else{
      console.log('esperando oportunidad...');
    }
  }

let priceMonitor;
let monitoringPrice = false;

const monitorPrice = async () => {
    console.log("Checking prices...");

    try {
        await checkPrices({
            inputTokenSymbol: "ETH",
            inputTokenAddress: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
            outputTokenSymbol: "DAI",
            outputTokenAddress: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
            inputAmount: web3.utils.toWei("1", "ETHER"),
        });

        await checkPrices({
            inputTokenSymbol: "ETH",
            inputTokenAddress: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
            outputTokenSymbol: "MKR",
            outputTokenAddress: "0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2",
            inputAmount: web3.utils.toWei("1", "ETHER"),
        });

        await checkPrices({
            inputTokenSymbol: "ETH",
            inputTokenAddress: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
            outputTokenSymbol: "LINK",
            outputTokenAddress: "0x514910771AF9Ca656af840dff83E8264EcF986CA",
            inputAmount: web3.utils.toWei("1", "ETHER"),
        });
    } catch (error) {
        //console.error(error);
        monitorPrice();
        //return;
    }
}

 monitorPrice();

/*async function monitorPrice() {
    if (monitoringPrice) {
        return;
    }

    console.log("Checking prices...");
    monitoringPrice = true;
    try {
        await checkPrices({
            inputTokenSymbol: "ETH",
            inputTokenAddress: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
            outputTokenSymbol: "DAI",
            outputTokenAddress: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
            inputAmount: web3.utils.toWei("1", "ETHER"),
        });

        await checkPrices({
            inputTokenSymbol: "ETH",
            inputTokenAddress: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
            outputTokenSymbol: "MKR",
            outputTokenAddress: "0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2",
            inputAmount: web3.utils.toWei("1", "ETHER"),
        });

        await checkPrices({
            inputTokenSymbol: "ETH",
            inputTokenAddress: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
            outputTokenSymbol: "LINK",
            outputTokenAddress: "0x514910771AF9Ca656af840dff83E8264EcF986CA",
            inputAmount: web3.utils.toWei("1", "ETHER"),
        });
    } catch (error) {
        console.error(error);
        monitoringPrice = false;
        clearInterval(priceMonitor);
        return;
    }

    monitoringPrice = false;
}

  //check market every second
  const POLLING_INTERVAL = process.env.POLLING_INTERVAL || 1500// 1 second
  priceMonitor = setInterval(async () => {await monitorPrice()}, POLLING_INTERVAL);*/
