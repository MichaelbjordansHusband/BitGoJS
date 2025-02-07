import { TransferBuilder as EthTransferBuilder } from '@bitgo/abstract-eth';

export class TransferBuilder extends EthTransferBuilder {
  /**
   * Get the prefix used in generating an operation hash for sending native coins
   * See https://github.com/BitGo/eth-multisig-v4/blob/master/contracts/coins/ArbethWalletSimple.sol
   *
   * @returns the string prefix
   */
  protected getNativeOperationHashPrefix(): string {
    return 'ARBETH';
  }

  /**
   * Get the prefix used in generating an operation hash for sending tokens
   * See https://github.com/BitGo/eth-multisig-v4/blob/master/contracts/coins/ArbethWalletSimple.sol
   *
   * @returns the string prefix
   */
  protected getTokenOperationHashPrefix(): string {
    return 'ARBETH-ERC20';
  }
}
