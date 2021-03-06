import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { CFCoreModule } from "../cfCore/cfCore.module";
import { ChannelModule } from "../channel/channel.module";
import { ChannelRepository } from "../channel/channel.repository";
import { ConfigModule } from "../config/config.module";
import { LoggerModule } from "../logger/logger.module";
import { MessagingModule } from "../messaging/messaging.module";
import { SwapRateModule } from "../swapRate/swapRate.module";
import { TransferModule } from "../transfer/transfer.module";
import { LinkedTransferRepository } from "../linkedTransfer/linkedTransfer.repository";
import { LinkedTransferModule } from "../linkedTransfer/linkedTransfer.module";
import { FastSignedTransferRepository } from "../fastSignedTransfer/fastSignedTransfer.repository";
import { FastSignedTransferModule } from "../fastSignedTransfer/fastSignedTransfer.module";

import { AppRegistryController } from "./appRegistry.controller";
import { AppRegistryRepository } from "./appRegistry.repository";
import { AppRegistryService } from "./appRegistry.service";
import { AppActionsService } from "./appActions.service";

@Module({
  controllers: [AppRegistryController],
  exports: [AppRegistryService, AppActionsService],
  imports: [
    CFCoreModule,
    ChannelModule,
    ConfigModule,
    FastSignedTransferModule,
    LinkedTransferModule,
    LoggerModule,
    MessagingModule,
    SwapRateModule,
    TransferModule,
    TypeOrmModule.forFeature([
      AppRegistryRepository,
      ChannelRepository,
      LinkedTransferRepository,
      FastSignedTransferRepository,
    ]),
  ],
  providers: [AppRegistryService, AppActionsService],
})
export class AppRegistryModule {}
