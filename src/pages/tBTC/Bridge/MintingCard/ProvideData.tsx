import { FC, Ref, useRef, useState } from "react"
import { FormikErrors, FormikProps, withFormik } from "formik"
import { Button, BodyMd } from "@threshold-network/components"
import { useTbtcState } from "../../../../hooks/useTbtcState"
import { TbtcMintingCardTitle } from "../components/TbtcMintingCardTitle"
import { TbtcMintingCardSubTitle } from "../components/TbtcMintingCardSubtitle"
import { Form, FormikInput } from "../../../../components/Forms"
import {
  getErrorsObj,
  validateBTCAddress,
  validateETHAddress,
} from "../../../../utils/forms"
import { MintingStep } from "../../../../types/tbtc"
import { useModal } from "../../../../hooks/useModal"
import { ModalType } from "../../../../enums"
import { useThreshold } from "../../../../contexts/ThresholdContext"
import { useWeb3React } from "@web3-react/core"
import { BitcoinNetwork } from "../../../../threshold-ts/types"
import { useTBTCDepositDataFromLocalStorage } from "../../../../hooks/tbtc"
import withOnlyConnectedWallet from "../../../../components/withOnlyConnectedWallet"
import { useDepositTelemetry } from "../../../../hooks/tbtc/useDepositTelemetry"

export interface FormValues {
  ethAddress: string
  btcRecoveryAddress: string
  bitcoinNetwork: BitcoinNetwork
}

type ComponentProps = {
  formId: string
}

const MintingProcessFormBase: FC<ComponentProps & FormikProps<FormValues>> = ({
  formId,
}) => {
  return (
    <Form id={formId} mb={6}>
      <FormikInput
        name="ethAddress"
        label="ETH address"
        tooltip="ETH address is prepopulated with your wallet address. This is the address where you’ll receive your tBTC."
        mb={6}
      />
      <FormikInput
        name="btcRecoveryAddress"
        label="BTC Recovery Address"
        tooltip="Recovery Address is a BTC address where your BTC funds are sent back if something exceptional happens with your deposit. The funds can be claimed by using the JSON file."
      />
    </Form>
  )
}

type MintingProcessFormProps = {
  initialEthAddress: string
  btcRecoveryAddress: string
  bitcoinNetwork: BitcoinNetwork
  innerRef: Ref<FormikProps<FormValues>>
  onSubmitForm: (values: FormValues) => void
} & ComponentProps

const MintingProcessForm = withFormik<MintingProcessFormProps, FormValues>({
  mapPropsToValues: ({
    initialEthAddress,
    btcRecoveryAddress,
    bitcoinNetwork,
  }) => ({
    ethAddress: initialEthAddress,
    btcRecoveryAddress: btcRecoveryAddress,
    bitcoinNetwork: bitcoinNetwork,
  }),
  validate: async (values) => {
    const errors: FormikErrors<FormValues> = {}
    errors.ethAddress = validateETHAddress(values.ethAddress)
    errors.btcRecoveryAddress = validateBTCAddress(
      values.btcRecoveryAddress,
      values.bitcoinNetwork as any
    )
    return getErrorsObj(errors)
  },
  handleSubmit: (values, { props }) => {
    props.onSubmitForm(values)
  },
  displayName: "MintingProcessForm",
})(MintingProcessFormBase)

export const ProvideDataComponent: FC<{
  onPreviousStepClick: (previosuStep: MintingStep) => void
}> = ({ onPreviousStepClick }) => {
  const { updateState } = useTbtcState()
  const [isSubmitButtonLoading, setSubmitButtonLoading] = useState(false)
  const formRef = useRef<FormikProps<FormValues>>(null)
  const { openModal } = useModal()
  const threshold = useThreshold()
  const { account } = useWeb3React()
  const { setDepositDataInLocalStorage } = useTBTCDepositDataFromLocalStorage()
  const depositTelemetry = useDepositTelemetry()

  const onSubmit = async (values: FormValues) => {
    setSubmitButtonLoading(true)
    const depositScriptParameters =
      await threshold.tbtc.createDepositScriptParameters(
        values.ethAddress,
        values.btcRecoveryAddress
      )

    const depositAddress = await threshold.tbtc.calculateDepositAddress(
      depositScriptParameters
    )

    // update state,
    updateState("ethAddress", values.ethAddress)
    updateState("blindingFactor", depositScriptParameters.blindingFactor)
    updateState("btcRecoveryAddress", values.btcRecoveryAddress)
    updateState(
      "walletPublicKeyHash",
      depositScriptParameters.walletPublicKeyHash
    )
    updateState("refundLocktime", depositScriptParameters.refundLocktime)

    // create a new deposit address,
    updateState("btcDepositAddress", depositAddress)

    setDepositDataInLocalStorage({
      ethAddress: values.ethAddress,
      blindingFactor: depositScriptParameters.blindingFactor,
      btcRecoveryAddress: values.btcRecoveryAddress,
      walletPublicKeyHash: depositScriptParameters.walletPublicKeyHash,
      refundLocktime: depositScriptParameters.refundLocktime,
      btcDepositAddress: depositAddress,
    })

    depositTelemetry(depositScriptParameters, depositAddress)

    // if the user has NOT declined the json file, ask the user if they want to accept the new file
    openModal(ModalType.TbtcRecoveryJson, {
      ethAddress: values.ethAddress,
      blindingFactor: depositScriptParameters.blindingFactor,
      walletPublicKeyHash: depositScriptParameters.walletPublicKeyHash,
      refundPublicKeyHash: depositScriptParameters.refundPublicKeyHash,
      refundLocktime: depositScriptParameters.refundLocktime,
      btcDepositAddress: depositAddress,
    })
  }

  return (
    <>
      <TbtcMintingCardTitle onPreviousStepClick={onPreviousStepClick} />
      <TbtcMintingCardSubTitle stepText="Step 1" subTitle="Provide Data" />
      <BodyMd color="gray.500" mb={12}>
        Based on these two addresses, the system will generate for you an unique
        BTC deposit address. There is no minting limit.
      </BodyMd>
      <MintingProcessForm
        innerRef={formRef}
        formId="tbtc-minting-data-form"
        initialEthAddress={account!}
        btcRecoveryAddress={""}
        bitcoinNetwork={threshold.tbtc.bitcoinNetwork}
        onSubmitForm={onSubmit}
      />
      <Button
        isLoading={isSubmitButtonLoading}
        loadingText={"Generating deposit address..."}
        type="submit"
        form="tbtc-minting-data-form"
        isFullWidth
      >
        Generate Deposit Address
      </Button>
    </>
  )
}

export const ProvideData = withOnlyConnectedWallet(ProvideDataComponent)
