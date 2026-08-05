require('dotenv').config();

const express = require('express');
const axios = require('axios');

const app = express();
const processedOrders = new Set();
const DIGITAL_PRODUCT_ID = Number(
  process.env.DIGITAL_PRODUCT_ID
);

app.use(express.json());

app.get('/', (req, res) => {

  res.send(
    'Digital Download Automation Running'
  );

});

app.post('/webhook/order-paid', async (req, res) => {

  try {

    const order = req.body;

    console.log('============================');
    console.log('NEW ORDER RECEIVED');
    console.log('============================');

    console.log(
      JSON.stringify(order, null, 2)
    );

    // IMPORTANT:
    // Respond immediately to Shopify

    res.status(200).json({
      success: true,
      message: 'Webhook received'
    });

    // Process in background
    processOrder(order);

  } catch (error) {

    console.error(
      'WEBHOOK ERROR:',
      error.message
    );

  }

});

async function processOrder(order) {

  try {

    console.log('============================');
    console.log('PROCESSING ORDER');
    console.log('============================');
    
if (processedOrders.has(order.id)) {

  console.log(
    'ORDER ALREADY PROCESSED'
  );

  return;

}

processedOrders.add(order.id);
    
    const lineItems =
      order.line_items || [];

    // =====================================
    // CHECK IF DIGITAL UPSELL EXISTS
    // =====================================

    const hasDigitalUpsell =
      lineItems.some(
        item =>
          Number(item.product_id) ===
          DIGITAL_PRODUCT_ID
      );

    if (!hasDigitalUpsell) {

      console.log(
        'No digital upsell found'
      );

      return;

    }

    console.log(
      'Digital upsell detected'
    );

    // =====================================
    // STEP 1:
    // FIND PRODUCTS LINKED
    // TO DIGITAL UPSELL
    // =====================================

    const linkedProductIds = [];

    for (const item of lineItems) {

      if (
        Number(item.product_id) ===
        DIGITAL_PRODUCT_ID
      ) {

        const popupProperty =
          (item.properties || []).find(
            prop =>
              prop.name ===
              '__pushAppsPopup'
          );

        if (
          popupProperty &&
          popupProperty.value
        ) {

          try {

            const popupData =
              JSON.parse(
                popupProperty.value
              );

            const primaryProductId =
              popupData.primaryProductId
                ?.split('/')
                ?.pop();

            if (primaryProductId) {

              linkedProductIds.push(
                Number(primaryProductId)
              );

              console.log(
                'Linked Product ID:',
                primaryProductId
              );

            }

          } catch (error) {

            console.log(
              'Invalid __pushAppsPopup JSON'
            );

          }

        }

      }

    }

    console.log(
      'FINAL LINKED PRODUCT IDS:',
      linkedProductIds
    );

    if (linkedProductIds.length === 0) {

      console.log(
        'No linked products found'
      );

      return;

    }

    // =====================================
    // STEP 2:
    // COLLECT ONLY PRODUCTS
    // THAT PURCHASED DIGITAL VERSION
    // =====================================

    const digitalProducts = [];

    for (const item of lineItems) {

      if (
        linkedProductIds.includes(
          Number(item.product_id)
        )
      ) {

        const imageProperty =
          (item.properties || []).find(
            prop =>
              prop.name ===
                '_customization_image' &&
              prop.value
          );

        if (imageProperty) {

          digitalProducts.push({

            title: item.title,

            preview_image:
              imageProperty.value,
            
            download_link:
             imageProperty.value,

            product_id:
              item.product_id

          });

          console.log(
            'Digital Product Added:',
            item.title
          );

        }

      }

    }

    if (digitalProducts.length === 0) {

      console.log(
        'No digital products found'
      );

      return;

    }

    console.log('============================');
    console.log('FINAL DIGITAL PRODUCTS');
    console.log('============================');

    console.log(
      JSON.stringify(
        digitalProducts,
        null,
        2
      )
    );

    // =====================================
    // SEND EVENT TO KLAVIYO
    // =====================================

    await sendToKlaviyo(
      order,
      digitalProducts
    );

  } catch (error) {

    console.error(
      'PROCESS ORDER ERROR:',
      error.message
    );

  }

}

async function sendToKlaviyo(
  order,
  digitalProducts
) {

  try {

    const customerEmail =
      order.email;

    const customerName =
      order.customer?.first_name ||
      'Customer';

    console.log('============================');
    console.log('SENDING TO KLAVIYO');
    console.log('============================');

    const payload = {

      data: {

        type: 'event',

        attributes: {

          properties: {

            order_number:
              order.order_number,

            digital_products:
              digitalProducts

          },

          time:
            new Date().toISOString(),

          value: 1,

          unique_id:
            `${order.id}`,

          metric: {

            data: {

              type: 'metric',

              attributes: {

                name:
                  'Digital Download File Ready'

              }

            }

          },

          profile: {

            data: {

              type: 'profile',

              attributes: {

                email:
                  customerEmail,

                first_name:
                  customerName

              }

            }

          }

        }

      }

    };

    const response =
      await axios.post(
        'https://a.klaviyo.com/api/events/',
        payload,
        {
          headers: {
            Authorization:
              `Klaviyo-API-Key ${process.env.KLAVIYO_API_KEY}`,
            accept:
              'application/json',
            'content-type':
              'application/json',
            revision:
              '2024-02-15'
          }
        }
      );

    console.log('============================');
    console.log('KLAVIYO EVENT SENT');
    console.log('============================');

    console.log(response.data);

  } catch (error) {

    console.error(
      'KLAVIYO ERROR:',
      error.response?.data ||
      error.message
    );

  }

}

app.listen(
  process.env.PORT || 3000,
  () => {

    console.log('============================');
    console.log(
      `SERVER RUNNING ON PORT ${
        process.env.PORT || 3000
      }`
    );
    console.log('============================');

  }
);
